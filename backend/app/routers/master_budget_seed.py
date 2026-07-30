# Central Park Master Budget Seed Data for FastAPI Backend

CENTRAL_PARK_MASTER_BUDGET_CATEGORIES = [
  {
    "id": "cat-1",
    "categoryName": "Site Development/Pre-Construction Work",
    "categoryCode": "SITE_DEVELOPMEN",
    "items": [
      {
        "id": "cp-item-1",
        "srNo": "1",
        "category": "Site Development/Pre-Construction Work",
        "item": "Temporary Site Barrication/Pre.Const. Work",
        "qtyRcc": None,
        "qtyFinishes": None,
        "qtyInfra": 1,
        "qtyTotal": 1,
        "unit": "LS",
        "rate": 500000,
        "cost": 500000,
        "costPerBua": 0.81,
        "scopeTag": "site_infra",
        "itemType": "labour"
      },
      {
        "id": "cp-item-2",
        "srNo": "2",
        "category": "Site Development/Pre-Construction Work",
        "item": "Intial Site Development (Hoarding/Site Office/Leveling/Cleaning)",
        "qtyRcc": None,
        "qtyFinishes": None,
        "qtyInfra": 1,
        "qtyTotal": 1,
        "unit": "LS",
        "rate": 5500000,
        "cost": 5500000,
        "costPerBua": 8.94,
        "scopeTag": "site_infra",
        "itemType": "material"
      },
      {
        "id": "cp-item-3",
        "srNo": "3",
        "category": "Site Development/Pre-Construction Work",
        "item": "GSB/Chaaru/Slag",
        "qtyRcc": None,
        "qtyFinishes": None,
        "qtyInfra": 1,
        "qtyTotal": 1,
        "unit": "LS",
        "rate": 1500000,
        "cost": 1500000,
        "costPerBua": 2.44,
        "scopeTag": "site_infra",
        "itemType": "material"
      }
    ],
    "totalCost": 7500000,
    "totalCostPerBua": 12.19
  },
  {
    "id": "cat-2",
    "categoryName": "Excavation/Backfilling and D-Wall/Pile Work",
    "categoryCode": "EXCAVATION_BACK",
    "items": [
      {
        "id": "cp-item-4",
        "srNo": "1",
        "category": "Excavation/Backfilling and D-Wall/Pile Work",
        "item": "Excavation/Backfilling",
        "qtyRcc": None,
        "qtyFinishes": None,
        "qtyInfra": None,
        "qtyTotal": 1,
        "unit": "LS",
        "rate": 4480000,
        "cost": 4480000,
        "costPerBua": 7.28,
        "scopeTag": "site_infra",
        "itemType": "material"
      },
      {
        "id": "cp-item-5",
        "srNo": "2",
        "category": "Excavation/Backfilling and D-Wall/Pile Work",
        "item": "JCB/Poclain (Labour)",
        "qtyRcc": None,
        "qtyFinishes": None,
        "qtyInfra": 1,
        "qtyTotal": 1,
        "unit": "LS",
        "rate": 1650000,
        "cost": 1650000,
        "costPerBua": 2.68,
        "scopeTag": "site_infra",
        "itemType": "labour"
      },
      {
        "id": "cp-item-6",
        "srNo": "3",
        "category": "Excavation/Backfilling and D-Wall/Pile Work",
        "item": "De-Watering",
        "qtyRcc": None,
        "qtyFinishes": None,
        "qtyInfra": 1,
        "qtyTotal": 1,
        "unit": "LS",
        "rate": 750000,
        "cost": 750000,
        "costPerBua": 1.22,
        "scopeTag": "site_infra",
        "itemType": "material"
      },
      {
        "id": "cp-item-7",
        "srNo": "2",
        "category": "Excavation/Backfilling and D-Wall/Pile Work",
        "item": "Diapharm Wall",
        "qtyRcc": None,
        "qtyFinishes": None,
        "qtyInfra": None,
        "qtyTotal": 1,
        "unit": "LS",
        "rate": 46000000,
        "cost": 46000000,
        "costPerBua": 74.8,
        "scopeTag": "site_infra",
        "itemType": "material"
      }
    ],
    "totalCost": 52880000,
    "totalCostPerBua": 85.98
  }
]
