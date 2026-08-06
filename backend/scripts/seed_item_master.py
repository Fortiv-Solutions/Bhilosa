import os
import sys
import openpyxl
import psycopg2
from dotenv import load_dotenv

# Load environment variables
dotenv_path = r"c:\Users\meetk\Pramukh-Group-AI-System-V2\backend\.env"
load_dotenv(dotenv_path)

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("Error: DATABASE_URL not found in backend/.env")
    sys.exit(1)

excel_path = r"C:\Users\meetk\Pramukh-Group-AI-System-V2\item-master\Item_Master.xlsx"
print(f"Loading Excel file from: {excel_path}")
wb = openpyxl.load_workbook(excel_path, data_only=True)
sheet = wb['Item_Master']
rows = list(sheet.iter_rows(values_only=True))

if not rows:
    print("Error: Empty Excel sheet")
    sys.exit(1)

print(f"Total rows in Excel (including header): {len(rows)}")

# UOM normalization map
UOM_MAP = {
    'BAG': 'BAG', 'Bags': 'BAG', 'bags': 'BAG',
    'BDL': 'BDL', 'bndl': 'BDL', 'BUNDLE': 'BDL',
    'BKT': 'BKT', 'Bucket': 'BKT',
    'BRASS': 'BRASS', 'Brass': 'BRASS',
    'Cum': 'CUM', 'cft': 'CFT',
    'Day': 'DAY', 'Per Day': 'DAY',
    'FLAT': 'FLAT', 'FT': 'FT', 'RFT': 'RFT', 'Rmt': 'RMT', 'Rn.ft': 'RFT',
    'Hrs': 'HRS', 'hrs': 'HRS',
    'KGS': 'KG', 'Kg': 'KG',
    'Lit': 'LTR', 'Ltr': 'LTR',
    'Lumpsum': 'LUMPSUM',
    'MTR': 'MTR', 'cm': 'CM',
    'NOS': 'NOS', 'Nos': 'NOS',
    'PCS': 'PCS', 'PKT': 'PKT', 'packet': 'PKT', 'box': 'BOX', 'doz': 'DOZ',
    'pairs': 'PAIR', 'roll': 'ROLL', 'set': 'SET',
    'SQF': 'SQFT', 'Sq.Ft.': 'SQFT', 'sqm': 'SQM',
    'TRIP': 'TRIP', 'Ton': 'TON'
}

# Resource type enum map
RESOURCE_TYPE_MAP = {
    'Material': 'material',
    'Equipment': 'equipment',
    'Service': 'service'
}

conn = psycopg2.connect(db_url)
cur = conn.cursor()

try:
    # 1. Enable pg_trgm extension
    cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    print("pg_trgm extension enabled.")

    # 2. Extract and seed units_of_measure
    raw_uoms = set()
    for r in rows[1:]:
        uom_raw = r[4]
        if uom_raw:
            norm = UOM_MAP.get(str(uom_raw).strip(), str(uom_raw).strip().upper())
            raw_uoms.add(norm)

    print(f"Normalized unique UOMs: {len(raw_uoms)}")
    uom_id_map = {}
    for uom_code in raw_uoms:
        cur.execute("""
            INSERT INTO units_of_measure (code, name, is_decimal_allowed)
            VALUES (%s, %s, true)
            ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
            RETURNING id, code;
        """, (uom_code, uom_code))
        u_id, u_code = cur.fetchone()
        uom_id_map[u_code] = u_id

    # Add fallback default UOM 'NOS' if not present
    if 'NOS' not in uom_id_map:
        cur.execute("""
            INSERT INTO units_of_measure (code, name, is_decimal_allowed)
            VALUES ('NOS', 'Number', true)
            ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
            RETURNING id, code;
        """)
        u_id, u_code = cur.fetchone()
        uom_id_map['NOS'] = u_id

    print(f"Seeded {len(uom_id_map)} Units of Measure.")

    # 3. Extract and seed item_groups
    groups_by_type = {}
    for r in rows[1:]:
        res_type_raw = r[0] or 'Material'
        group_raw = r[2] or 'General Material'
        
        res_type = RESOURCE_TYPE_MAP.get(str(res_type_raw).strip(), 'material')
        group_name = str(group_raw).strip()
        if group_name == '#VALUE!' or not group_name:
            group_name = 'General'

        if res_type not in groups_by_type:
            groups_by_type[res_type] = set()
        groups_by_type[res_type].add(group_name)

    group_id_map = {} # (res_type, group_name) -> uuid
    used_codes = set()
    code_counter = 1
    for res_type, group_names in groups_by_type.items():
        for g_name in group_names:
            clean_words = [w for w in g_name.replace('&', '').replace('-', ' ').split() if w]
            base_code = ''.join([w[0].upper() for w in clean_words])[:6]
            if len(base_code) < 2:
                base_code = (g_name.upper().replace(' ', '') + 'GRP')[:6]
            
            code = base_code
            while code in used_codes:
                code = f"{base_code[:4]}{code_counter:02d}"
                code_counter += 1
            used_codes.add(code)
            
            cur.execute("""
                INSERT INTO item_groups (code, name, resource_type, is_active)
                VALUES (%s, %s, %s::resource_type_enum, true)
                ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
                RETURNING id, name;
            """, (code, g_name, res_type))
            res = cur.fetchone()
            group_id_map[(res_type, g_name)] = res[0]

    print(f"Seeded {len(group_id_map)} Item Groups.")

    # 4. Insert items
    items_inserted = 0
    items_updated = 0

    for r in rows[1:]:
        res_type_raw, item_code_raw, item_group_raw, item_desc_raw, uom_raw, inactive_raw, tax_rate_raw, lead_period_raw, status_raw = r[:9]

        if not item_code_raw or not item_desc_raw:
            continue

        res_type = RESOURCE_TYPE_MAP.get(str(res_type_raw).strip() if res_type_raw else 'Material', 'material')
        item_code = str(item_code_raw).strip()
        # If item_code is numeric like 5.0, convert to string
        if item_code.endswith('.0'):
            item_code = item_code[:-2]

        group_name = str(item_group_raw).strip() if item_group_raw and str(item_group_raw).strip() != '#VALUE!' else 'General'
        group_id = group_id_map.get((res_type, group_name))
        if not group_id:
            # Fallback to any group in group_id_map
            group_id = list(group_id_map.values())[0]

        item_desc = str(item_desc_raw).strip()
        uom_code = UOM_MAP.get(str(uom_raw).strip() if uom_raw else 'NOS', 'NOS')
        uom_id = uom_id_map.get(uom_code, uom_id_map['NOS'])

        is_inactive = bool(inactive_raw) if inactive_raw is not None else False
        
        try:
            tax_rate = float(tax_rate_raw) if tax_rate_raw is not None else 0.0
        except Exception:
            tax_rate = 0.0

        try:
            lead_period = int(float(lead_period_raw)) if lead_period_raw is not None else 0
        except Exception:
            lead_period = 0

        # Status mapping to match Supabase enum ['active', 'archived', 'draft', 'inactive', 'pending_approval']
        status_str = str(status_raw).strip().lower() if status_raw else 'active'
        if status_str in ['approved', 'active']:
            status_enum = 'active'
        elif status_str in ['approval', 'pending_approval']:
            status_enum = 'pending_approval'
        elif status_str in ['draft']:
            status_enum = 'draft'
        elif status_str in ['delete', 'archived']:
            status_enum = 'archived'
        else:
            status_enum = 'active'

        cur.execute("""
            INSERT INTO items (
                resource_type,
                item_code,
                item_group_id,
                item_description,
                primary_uom_id,
                tax_rate,
                lead_period_days,
                status,
                is_inactive
            ) VALUES (
                %s::resource_type_enum,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s::item_status_enum,
                %s
            )
            ON CONFLICT (item_code) DO UPDATE SET
                item_description = EXCLUDED.item_description,
                tax_rate = EXCLUDED.tax_rate,
                lead_period_days = EXCLUDED.lead_period_days,
                status = EXCLUDED.status,
                is_inactive = EXCLUDED.is_inactive,
                updated_at = NOW();
        """, (
            res_type,
            item_code,
            group_id,
            item_desc,
            uom_id,
            tax_rate,
            lead_period,
            status_enum,
            is_inactive
        ))
        items_inserted += 1

    conn.commit()
    print(f"Successfully seeded {items_inserted} items into Supabase PostgreSQL!")

    # 5. Create Trigram Index for fast fuzzy search
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_items_trgm_search 
        ON items USING gin ((item_code || ' ' || item_description) gin_trgm_ops);
    """)
    conn.commit()
    print("Created Trigram search index idx_items_trgm_search.")

except Exception as e:
    conn.rollback()
    print(f"Error during seeding: {e}")
    sys.exit(1)
finally:
    cur.close()
    conn.close()
