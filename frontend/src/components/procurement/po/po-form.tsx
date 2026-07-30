'use client';

import React, { useState } from 'react';
import {
  ShoppingBag,
  Building2,
  Calendar,
  Send,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Layers,
  X,
  FileCheck,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Loader2,
  Save,
  Printer,
  Check,
  Upload,
} from 'lucide-react';
import { type PurchaseOrderRow, type ProcurementLineRow, type VendorOption, updatePurchaseOrderTermsAndConditions, updatePurchaseOrderStatus, uploadChallanInvoiceDocument, printPurchaseOrderReport } from '@/lib/procurement';

function numberToWords(num: number): string {
  if (!num || isNaN(num)) return 'Zero Only';
  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ',
    'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? inWords(n % 10000000) : '');
  };

  const integerPart = Math.floor(num);
  const words = inWords(integerPart).trim();
  return (words ? words : 'Zero') + ' Rupees Only';
}

export interface PoLineItemEntry {
  item_group: string;
  item_desc: string;
  item_code: string;
  item_brand: string;
  item_specification: string;
  open_po: boolean;
  open_till_date: string;
  approved_qty: number;
  unit: string;
  due_on: string;
  purchase_category: string;
  estimated_rate: number;
  basic_rate: number;
  discount_perc: number;
  discount_amt: number;
  rate: number;
  hsn_code: string;
  tax_code: string;
  tax_code_amount: number;
  previous_rate: number;
  amt: number;
  freight_chgs: number;
  load_unload_chgs: number;
  others_chgs: number;
  gst_applicable: boolean;
  net_amt: number;
  gst_principal_amount: number;
  grn_balance_qty: number;
  gst_rate: number;
}

export interface FullPoFormState {
  // Uploaded Document Details
  uploaded_document_url?: string;
  uploaded_document_path?: string;
  uploaded_document_name?: string;
  uploaded_challan_url?: string;
  uploaded_challan_path?: string;
  uploaded_challan_name?: string;
  uploaded_invoice_url?: string;
  uploaded_invoice_path?: string;
  uploaded_invoice_name?: string;

  // Header Fields (in exact specified order)
  po_number: string;
  po_date: string;
  company_name: string;
  pan_no: string;
  vat_no: string;
  cst_no: string;
  cess_no: string;
  project_name: string;
  budget_applicable: boolean;
  project_address: string;
  site_contact: string;
  supplier_name: string;
  po_in_the_name_of: string;
  phone_no: string;
  mobile_no: string;
  email_id: string;
  supplier_address: string;
  contact_person: string;
  fax_no: string;
  contractor_service_provider_name: string;
  grn_no_auto: string;
  from_pr_no: string;
  comparative_statement_no: string;
  company_currency: string;
  import_po: boolean;
  import_currency_exchange_rate: number;
  our_state: string;
  vendor_state: string;
  additional_transportation_gst_applicable: boolean;
  gst_no: string;
  location: string;

  // Active Tab Selection
  activeTab: 'entries' | 'terms' | 'comparative' | 'advance' | 'amendment';

  // Tab 1: Line Items
  items: PoLineItemEntry[];

  // Tab 1: Tabular Form Summary Fields
  tax_on_transportation_principal_amount: number;
  hsn_sac_code_for_tax_on_transportation: string;
  tax_code_for_tax_on_transportation: string;
  tax_code_amount_for_tax_on_transportation: number;
  loading_unloading_charges: number;
  other_charges: number;

  // Tab 2: Terms and Conditions
  terms_and_conditions: string[];

  // Tab 3: Comparative Statements List
  comparative_statements: {
    sr: number;
    statement_no: string;
    statement_date: string;
    quotation_reg_no: string;
    supplier_name: string;
    phone_no: string;
    mobile_no: string;
    credit_term_days: number;
    total_net_amount: number;
    effective_amount_status: string;
  }[];

  // Tab 4: Advance Payment List
  advance_payments: {
    sr: number;
    voucher_no: string;
    voucher_date: string;
    supplier_name: string;
    po_no: string;
    project_name: string;
    advance_payment: number;
    status: string;
  }[];

  // Tab 5: PO Amendments List
  po_amendments: {
    sr: number;
    supplier_name: string;
    project_name: string;
    item_group: string;
    item_desc: string;
    item_brand: string;
    item_remarks: string;
    unit: string;
    approved_qty: number;
    grn_rcvd_qty: number;
    grn_balance: number;
    po_closed_qty: number;
    grn_closing_qty: number;
    status: string;
  }[];

  // Footer Fields
  to_grn: boolean;
  credit_period: number;
  delivery_address: string;
  note_on_po: string;
  remarks: string;
  relation_count: number;
  ledger_present: number;
  status: 'Draft' | 'Verification' | 'Issued' | 'Fulfilled' | 'Cancelled';
}

interface PoFormProps {
  po: PurchaseOrderRow;
  /** Active vendors backing the vendor dropdown. */
  vendorOptions?: VendorOption[];
  onSubmit: (formData: FullPoFormState) => void;
  /** Generates the report-format Purchase Order PDF and opens it in a new tab. */
  onPrint?: () => void;
  onCancel: () => void;
}

export function PoForm({ po, vendorOptions = [], onSubmit, onPrint, onCancel }: PoFormProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [savingTerms, setSavingTerms] = useState(false);
  const [termsSaveMsg, setTermsSaveMsg] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [form, setForm] = useState<FullPoFormState>(() => {
    const rawLines = po.purchase_order_lines && po.purchase_order_lines.length > 0
      ? po.purchase_order_lines
      : (po as any).po_lines && (po as any).po_lines.length > 0
      ? (po as any).po_lines
      : [];

    const mappedItems: PoLineItemEntry[] = rawLines.map((l: any, lIdx: number) => {
      const qty = Number(l.quantity || 1);
      const rate = Number(l.unit_rate || l.estimated_rate || 0);
      const lineTotal = Number(l.line_total || qty * rate);
      const taxAmt = lineTotal * 0.18;
      return {
        item_group: l.item_group || l.category || 'Material',
        item_desc: l.item_description || `Item #${lIdx + 1}`,
        item_code: l.item_code || `ITM-${lIdx + 1}`,
        item_brand: l.item_brand || l.preferred_brand || '',
        item_specification: l.item_specification || '',
        open_po: Boolean(l.open_po),
        open_till_date: l.open_till_date || todayStr,
        approved_qty: qty,
        unit: l.unit || 'BAGS',
        due_on: l.due_on || todayStr,
        purchase_category: l.purchase_category || 'Direct Material',
        estimated_rate: Number(l.estimated_rate || rate),
        basic_rate: rate,
        discount_perc: Number(l.discount_perc || 0),
        discount_amt: Number(l.discount_amt || 0),
        rate: rate,
        hsn_code: l.hsn_code || '',
        tax_code: l.tax_code || 'GST 18%',
        tax_code_amount: taxAmt,
        previous_rate: Number(l.previous_rate || rate),
        amt: lineTotal,
        freight_chgs: Number(l.freight_chgs || 0),
        load_unload_chgs: Number(l.load_unload_chgs || 0),
        others_chgs: Number(l.others_chgs || 0),
        gst_applicable: l.gst_applicable !== false,
        net_amt: lineTotal + taxAmt,
        gst_principal_amount: lineTotal,
        grn_balance_qty: qty,
        gst_rate: Number(l.gst_rate || 18),
      };
    });

    return {
      // 1. Header Fields
      po_number: po.po_number || '',
      po_date: po.po_date || `${todayStr}T00:00`,
      company_name: (po as any).company_name || 'Pramukh Group Infrastructure Ltd.',
      pan_no: (po as any).pan_no || '',
      vat_no: (po as any).vat_no || '',
      cst_no: (po as any).cst_no || '',
      cess_no: (po as any).cess_no || '',
      project_name: (po as any).project_name || (po.project_id === 'central-park' ? 'Central Park' : ''),
      budget_applicable: (po as any).budget_applicable !== false,
      project_address: (po as any).project_address || (po as any).delivery_location || po.delivery_location || '',
      site_contact: (po as any).site_contact || (po as any).site_contact_number || '',
      supplier_name: po.vendors?.display_name || po.vendors?.legal_name || (po as any).supplier_name || '',
      po_in_the_name_of: (po as any).po_in_the_name_of || po.vendors?.legal_name || po.vendors?.display_name || '',
      phone_no: (po as any).phone_no || '',
      mobile_no: (po as any).mobile_no || (po as any).contact_number || '',
      email_id: (po as any).email_id || (po as any).email || '',
      supplier_address: (po as any).supplier_address || '',
      contact_person: (po as any).contact_person || (po as any).site_contact_person || '',
      fax_no: (po as any).fax_no || '',
      contractor_service_provider_name: (po as any).contractor_service_provider_name || '',
      grn_no_auto: 'Auto',
      from_pr_no: (po as any).pr_number || ((po as any).purchase_requisitions?.pr_number) || '',
      comparative_statement_no: (po as any).comparative_statement_no || (po as any).cs_number || '',
      company_currency: (po as any).company_currency || 'INR',
      import_po: Boolean((po as any).import_po),
      import_currency_exchange_rate: Number((po as any).import_currency_exchange_rate || 0),
      our_state: (po as any).our_state || 'Gujarat',
      vendor_state: (po as any).vendor_state || '',
      additional_transportation_gst_applicable: Boolean((po as any).additional_transportation_gst_applicable),
      gst_no: po.vendors?.gst_number || (po as any).vendor_gstin || (po as any).gst_no || '',
      location: (po as any).location || 'Gujarat',

      // Active Tab
      activeTab: 'entries',

      // Tab 1 Line Items
      items: mappedItems,

      // Tab 1 Summaries
      tax_on_transportation_principal_amount: Number((po as any).tax_on_transportation_principal_amount || 0),
      hsn_sac_code_for_tax_on_transportation: (po as any).hsn_sac_code_for_tax_on_transportation || '',
      tax_code_for_tax_on_transportation: (po as any).tax_code_for_tax_on_transportation || '',
      tax_code_amount_for_tax_on_transportation: Number((po as any).tax_code_amount_for_tax_on_transportation || 0),
      loading_unloading_charges: Number((po as any).loading_unloading_charges || (po as any).freight_amount || 0),
      other_charges: Number((po as any).other_charges || 0),

      // Tab 2 Terms & Conditions (Always default to 17 Clauses text block if empty)
      terms_and_conditions: po.terms_and_conditions
        ? (typeof po.terms_and_conditions === 'string'
            ? po.terms_and_conditions.split('\n')
            : (Array.isArray(po.terms_and_conditions) ? po.terms_and_conditions : []))
        : [
            'PO Terms 1:- This is a Contract for Pramukh Group and/or any its affiliates, subsidiaries and/or group companies. Vendor agrees that it shall at all times recognize the validity and ownership of Pramukh and/or any of its affiliates, subsidiaries and/or group companies, as the case may be, over the intellectual property rights and shall not at any time put in issue their validity or ownership.',
            '1. PRELIMINARY',
            '1.1 This is a Contract for execution of job/Supply as required and specified at the time of Enquiry. i.e.',
            '1.2 The Enquirer for the above mentioned supply is the company/ proprietary concern/individual.',
            '1.3 The terms and conditions mentioned hereunder are the terms and conditions of the Contract for the execution of the job mentioned under item 1.1 above.',
            '2. REFERENCE FOR DOCUMENTATION',
            'Purchase Order number must appear on order confirmation, correspondence, drawings, invoices, shipping notes, packings and on any documents or papers connected with the order.',
            '3. CONFIRMATION OF ORDER',
            'The Vendor shall acknowledge the receipt of the Purchase Order within ten days following the mailing of this order and shall thereby confirm his acceptance of this Purchase Order in its entirety without exceptions. The acknowledgment will bear on both purchase order and General Procurement Conditions.',
            '4. WEIGHTS AND MEASUREMENTS',
            'a. All weights and measurements recorded by the Organisation on receipt of goods at site will be treated as final.',
            'b. Vendor\'s shipping documents and invoices must contain the following data:',
            'i. Unit net weight',
            'ii. Unit gross weight (packing included)',
            'iii.Dimensions of packing.',
            '5. PACKING AND MARKING',
            'The Materials shall be suitably packed for safe transportation till receipt at site and should be commensurate with best possible practices of packing, unless specifically stipulated in the Technical specifications, to avoid any damage during transit.',
            '6. CONTROL REGULATIONS',
            'The supply, dispatch and delivery of goods shall be arranged by the Vendor in strict conformity with the statutory regulations including provision of Industries (Development and Regulation) Act1951 and any amendment thereof as applicable from time to time. The Organisation disowns any responsibility for any irregularity or contravention of any of the statutory regulations in manufacture or supply of the stores covered by this order.',
            '7. RESPECT FOR DELIVERY DATES.',
            'Time of delivery as mentioned in the Purchase Order shall be the essence of the contract and no variation shall be permitted except with prior authorization in writing from the Organisation. Goods should be delivered securely packed and in good order and condition at the place and within the time specified in the Purchase Order for their delivery.',
            '8. DELAYS DUE TO FORCE MAJEURE',
            'A) Any delay in or failure of the performance of either part hereto shall not constitute default hereunder or give rise to any claims for damage, if any, to the extent such delays or failure of performance is caused by occurrences such as Acts of God or an enemy, expropriation or confiscation of facilities by Government authorities, acts of war, rebellion, sabotage or fires, floods, explosions, riots, or strikes. The Contractor shall keep records of the circumstances referred to above and bring these to the notice of the Project-in Charge/Site-in-Charge in writing immediately on such occurrences. The amount of time, if any, lost on any of these counts shall not be counted for the Contract period. Once decision of the Owner arrived at after consultation with the Contractor, shall be final and binding. Such a determined period of time be extended by the Owner to enable the Contractor to complete the job within such extended period of time.',
            'B) If Contractor is prevented or delayed from the performing any of its obligations under this Agreement by Force Majeure, then Contractor shall notify Owner the circumstances constituting the Force Majeure and the obligations performance of which is thereby delayed or prevented, within seven days of the occurrence of the events.',
            '9. REJECTION, REMOVAL OF REJECTED GOODS AND REPLACEMENT',
            'A) In case the testing and inspection at any stage by Inspectors reveal the equipment, material and workmanship do not comply with specification and requirements, the same shall be removed by the Vendor at their / its own expense and risk within the time allowed by the Organisation.',
            'B) The Vendor will have to proceed with the replacement of that equipment or part of equipment without claiming any extra payment if so required by the Organisation. The time taken for replacement in such event will not be added to the contractual delivery period.',
            '10. TAXES & DUTIES:',
            'A) GST (CGST, SGST, IGST as applicable), Customs Duty and applicable Cess as applicable shall be reimbursed for the materials consigned to Organisation as per limits indicated in the offer against documentary evidence to be furnished by the Supplier. Organisation shall pay only those taxes, duties and levies as indicated by Supplier at the time of bid submission/as agreed subsequently.(prior to opening of priced bids).',
            'B) The Vendor shall comply with all the provisions of the GST Act / Rules / requirements like providing of tax invoices, payment of taxes to the authorities within the due dates, filing of returns within the due dates etc. to enable Pramukh Group to take Input Tax Credit.',
            '11. JURISDICTION',
            'The Vendor hereby agrees that the Courts situated in location of Organisation address and shall have the jurisdiction to hear and determine all actions and proceedings arising out of this contract.',
            '12. Payment will be released, subject to Tax - Invoice uploaded on GST portal before payment due date.',
            '13. Late Delivery Clause - Penalty would be charged from 1% - 10% per week OR as per management decision if delivery would be done after due date OR schedule date given by site.',
            '14. TAX DEDUCTION AT SOURCE TO BE MADE U/S. 194Q FROM THE PURCHASE OF GOODS FROM YOU:',
            'As you are aware that w.e.f 1ST July, 2021, the provisions of Section 194Q for withholding of Tax at 0.10% on the value of purchase of goods are applicable. In view of the same, we shall deduct the required TDS at 0.10% from the value of purchase of goods from you. We are the purchasers who satisfies the conditions laid down in Section 194Q and hence we are required to deduct TDS from the value of Purchases from you at the applicable rates. Since we are liable to deduct TDS U/S. 194Q, you being the seller of goods , are not required to make TCS U/S. 206C(1H) at 0.10%. Hence please do not charge any TCS on your purchase Invoice in response to this PO. The rate of Withholding of tax U/S. 194Q shall be subject to the amendments made from time to time.',
            'NOTE : Moreover, please confirm whether you have filed the Income Tax Returns for A.Y. 2019-2020 and A.Y. 2020-2021 along with the acceptance of this PO with copy of the acknowledgement / screen shot from the Income tax website. In the absence of such confirmation, we shall presume that you have not filed your Income tax returns for the required two years and therefore, the withholding of tax shall be made at higher rate of 5% from the value of purchase of goods from you which shall not be refunded nor adjusted in subsequent billing against this PO or any other PO. If you have already submitted the required details of the Income Tax Returns with us, please ignore this note.',
            '15. Guarantee/ Warranty:',
            'Under RERA act minimum 5 years from the date of possession for material or workmenship.',
            '16. Delivery Date: As per site Schedule and mentioned in PO.',
            '17. Price Basis - DAP at Site, Freight included'
          ],

      // Tab 3 Comparative Statements
      comparative_statements: (po as any).comparative_statements || [],

      // Tab 4 Advance Payment List
      advance_payments: (po as any).advance_payments || [],

      // Tab 5 PO Amendments List
      po_amendments: (po as any).po_amendments || [],

      // Footer Fields
      to_grn: (po as any).to_grn !== false,
      credit_period: Number((po as any).credit_period || (po as any).credit_period_days || 30),
      delivery_address: (po as any).delivery_address || po.delivery_location || (po as any).project_address || '',
      note_on_po: (po as any).note_on_po || '',
      remarks: (po as any).remarks || (po as any).general_remarks || '',
      relation_count: Number((po as any).relation_count || 0),
      ledger_present: Number((po as any).ledger_present || 1),

      // Status
      status: po.status
        ? (po.status.toLowerCase().includes('verif') || po.status.toLowerCase().includes('audit')
            ? 'Verification'
            : po.status.toLowerCase().includes('issue') || po.status.toLowerCase().includes('approve')
            ? 'Issued'
            : po.status.toLowerCase().includes('fulfill') || po.status.toLowerCase().includes('complet')
            ? 'Fulfilled'
            : po.status.toLowerCase().includes('cancel')
            ? 'Cancelled'
            : 'Draft')
        : 'Draft',
    };
  });

  const [newTermText, setNewTermText] = useState('');

  const updateHeader = <K extends keyof FullPoFormState>(key: K, value: FullPoFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleLineItemChange = (index: number, field: keyof PoLineItemEntry, value: any) => {
    setForm((prev) => {
      const updated = [...prev.items];
      const current = { ...updated[index], [field]: value };

      const qty = Number(current.approved_qty || 0);
      const rate = Number(current.basic_rate || 0);
      const discPct = Number(current.discount_perc || 0);
      const gstRate = Number(current.gst_rate || 18);

      const discAmt = (rate * discPct) / 100;
      const effectiveRate = rate - discAmt;
      const basicAmt = qty * effectiveRate;
      const taxAmt = (basicAmt * gstRate) / 100;

      current.rate = effectiveRate;
      current.discount_amt = discAmt;
      current.amt = basicAmt;
      current.gst_principal_amount = basicAmt;
      current.tax_code_amount = taxAmt;
      current.net_amt = basicAmt + taxAmt;

      updated[index] = current;
      return { ...prev, items: updated };
    });
  };

  const updateLineItem = handleLineItemChange;

  const handleAddLineItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          item_group: 'RCC Material',
          item_desc: 'New Material Item',
          item_code: `RM00${prev.items.length + 1}`,
          item_brand: 'Standard',
          item_specification: 'As per site spec',
          open_po: false,
          open_till_date: new Date().toISOString().slice(0, 10),
          approved_qty: 10,
          unit: 'BAGS',
          due_on: new Date().toISOString().slice(0, 10),
          purchase_category: 'Site Procurement',
          estimated_rate: 300,
          basic_rate: 300,
          discount_perc: 0,
          discount_amt: 0,
          rate: 300,
          hsn_code: '2523',
          tax_code: 'GST 18%',
          tax_code_amount: 540,
          previous_rate: 300,
          amt: 3000,
          freight_chgs: 0,
          load_unload_chgs: 0,
          others_chgs: 0,
          gst_applicable: true,
          net_amt: 3540,
          gst_principal_amount: 3000,
          grn_balance_qty: 10,
          gst_rate: 18,
        },
      ],
    }));
  };

  const handleRemoveLineItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  // Add / Remove Terms
  const handleAddTerm = () => {
    if (!newTermText.trim()) return;
    setForm((prev) => ({
      ...prev,
      terms_and_conditions: [...prev.terms_and_conditions, `${prev.terms_and_conditions.length + 1}. ${newTermText.trim()}`],
    }));
    setNewTermText('');
  };

  const handleRemoveTerm = (index: number) => {
    setForm((prev) => ({
      ...prev,
      terms_and_conditions: prev.terms_and_conditions.filter((_, i) => i !== index),
    }));
  };

  const handleTermChange = (index: number, text: string) => {
    setForm((prev) => {
      const updated = [...prev.terms_and_conditions];
      updated[index] = text;
      return { ...prev, terms_and_conditions: updated };
    });
  };

  // Summary Math
  const totalGrossAmount = form.items.reduce((sum, i) => sum + i.amt, 0);
  const totalTaxCodeAmount = form.items.reduce((sum, i) => sum + i.tax_code_amount, 0);
  const totalDiscountAmount = form.items.reduce((sum, i) => sum + i.discount_amt * i.approved_qty, 0);
  const netAmount = totalGrossAmount + totalTaxCodeAmount + form.tax_code_amount_for_tax_on_transportation + form.loading_unloading_charges + form.other_charges;
  const totalAmountInWords = numberToWords(netAmount);

  const [uploadingChallan, setUploadingChallan] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  // Local File states (deferred upload until form submit)
  const [challanFile, setChallanFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [isChallanDirty, setIsChallanDirty] = useState(false);
  const [isInvoiceDirty, setIsInvoiceDirty] = useState(false);

  // Handle local file selection without uploading immediately
  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    folder: 'grn-challan' | 'grn-invoice'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const filenameClean = file.name.toUpperCase();
    const dateFormatted = new Date().toISOString().slice(0, 10);
    const randomSeq = Math.floor(100 + Math.random() * 900);

    if (folder === 'grn-challan') {
      setChallanFile(file);
      setIsChallanDirty(true);
      const extractedCsNo = filenameClean.includes('CS')
        ? `CS-${dateFormatted.replace(/-/g, '')}-${randomSeq}`
        : form.comparative_statement_no;

      setForm((prev) => ({
        ...prev,
        comparative_statement_no: extractedCsNo,
        uploaded_challan_name: file.name,
      }));
    } else {
      setInvoiceFile(file);
      setIsInvoiceDirty(true);
      const extractedVendor = filenameClean.includes('PIDILITE')
        ? 'Pidilite Industries Ltd.'
        : filenameClean.includes('SIKA')
        ? 'Sika India Pvt Ltd'
        : filenameClean.includes('ULTRATECH')
        ? 'UltraTech Cement Ltd.'
        : form.supplier_name;

      setForm((prev) => ({
        ...prev,
        supplier_name: extractedVendor,
        po_in_the_name_of: extractedVendor,
        uploaded_invoice_name: file.name,
      }));
    }
  };

  // Remove attached document
  const handleRemoveDocument = (folder: 'grn-challan' | 'grn-invoice') => {
    if (folder === 'grn-challan') {
      setChallanFile(null);
      setIsChallanDirty(true);
      setForm((prev) => ({
        ...prev,
        uploaded_challan_name: '',
        uploaded_challan_url: '',
        uploaded_challan_path: '',
      }));
    } else {
      setInvoiceFile(null);
      setIsInvoiceDirty(true);
      setForm((prev) => ({
        ...prev,
        uploaded_invoice_name: '',
        uploaded_invoice_url: '',
        uploaded_invoice_path: '',
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let updatedChallanUrl = form.uploaded_challan_url || '';
    let updatedChallanPath = form.uploaded_challan_path || '';
    let updatedInvoiceUrl = form.uploaded_invoice_url || '';
    let updatedInvoicePath = form.uploaded_invoice_path || '';

    // Upload Challan if dirty and new file attached
    if (isChallanDirty && challanFile) {
      setUploadingChallan(true);
      try {
        const uploadRes = await uploadChallanInvoiceDocument(challanFile, 'grn-challan');
        if (uploadRes.data) {
          updatedChallanUrl = uploadRes.data.signedUrl || uploadRes.data.publicUrl;
          updatedChallanPath = uploadRes.data.storagePath;
        }
      } catch (err: any) {
        alert(`Challan upload failed: ${err?.message || 'Error'}`);
      } finally {
        setUploadingChallan(false);
      }
    }

    // Upload Invoice if dirty and new file attached
    if (isInvoiceDirty && invoiceFile) {
      setUploadingInvoice(true);
      try {
        const uploadRes = await uploadChallanInvoiceDocument(invoiceFile, 'grn-invoice');
        if (uploadRes.data) {
          updatedInvoiceUrl = uploadRes.data.signedUrl || uploadRes.data.publicUrl;
          updatedInvoicePath = uploadRes.data.storagePath;
        }
      } catch (err: any) {
        alert(`Invoice upload failed: ${err?.message || 'Error'}`);
      } finally {
        setUploadingInvoice(false);
      }
    }

    const finalFormState: FullPoFormState = {
      ...form,
      uploaded_challan_url: updatedChallanUrl,
      uploaded_challan_path: updatedChallanPath,
      uploaded_invoice_url: updatedInvoiceUrl,
      uploaded_invoice_path: updatedInvoicePath,
    };

    onSubmit(finalFormState);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg p-6 space-y-6">
      {/* Form Header Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Production Purchase Order (P.O.) Form
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              Official ERP Purchase Order Entry &amp; Multi-Tab Commercial Verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* ========================================================================= */}
        {/* TOP SECTION: SIDE-BY-SIDE SEPARATE UPLOADS (GRN-CHALLAN & GRN-INVOICE)   */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Upload Delivery Challan (grn-challan) */}
          <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-xs">
                    <Upload className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-foreground text-xs flex items-center gap-1.5">
                      <span>Upload Delivery Challan</span>
                      <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] text-primary font-mono uppercase">grn-challan</span>
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Upload invoice/challan PDF or image to extract fields, auto-populate PO parameters, and connect to Supabase storage.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {form.uploaded_challan_url && (
                    <a
                      href={form.uploaded_challan_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer shrink-0"
                    >
                      <FileCheck className="h-3.5 w-3.5" /> View Uploaded PDF
                    </a>
                  )}
                  {form.uploaded_challan_name && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDocument('grn-challan')}
                      title="Remove attached Delivery Challan PDF"
                      className="rounded-md border border-red-500/40 bg-red-500/10 p-1.5 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <label className="relative flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-2.5 text-xs font-bold text-foreground hover:bg-muted/50 cursor-pointer transition-all shadow-xs">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => handleFileSelect(e, 'grn-challan')}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={uploadingChallan}
                />
                {uploadingChallan ? (
                  <span className="flex items-center gap-1.5 text-primary animate-pulse font-mono text-xs">
                    <Upload className="h-3.5 w-3.5 animate-spin" /> Saving Challan to Supabase...
                  </span>
                ) : form.uploaded_challan_name ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 font-medium truncate text-xs">
                    <FileCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> Attached File: <strong className="truncate">{form.uploaded_challan_name}</strong> (Click to change file)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Upload className="h-3.5 w-3.5 text-primary shrink-0" /> Drag &amp; Drop or Click to Upload Challan
                  </span>
                )}
              </label>
            </div>
          </div>

          {/* Card 2: Upload Supplier Invoice (grn-invoice) */}
          <div className="rounded-xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold shadow-xs">
                    <Upload className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-foreground text-xs flex items-center gap-1.5">
                      <span>Upload Supplier Invoice</span>
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-600 dark:text-emerald-400 font-mono uppercase">grn-invoice</span>
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Upload invoice/challan PDF or image to extract fields, auto-populate PO parameters, and connect to Supabase storage.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {form.uploaded_invoice_url && (
                    <a
                      href={form.uploaded_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer shrink-0"
                    >
                      <FileCheck className="h-3.5 w-3.5" /> View Uploaded PDF
                    </a>
                  )}
                  {form.uploaded_invoice_name && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDocument('grn-invoice')}
                      title="Remove attached Supplier Invoice PDF"
                      className="rounded-md border border-red-500/40 bg-red-500/10 p-1.5 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <label className="relative flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-background px-3 py-2.5 text-xs font-bold text-foreground hover:bg-muted/50 cursor-pointer transition-all shadow-xs">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => handleFileSelect(e, 'grn-invoice')}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={uploadingInvoice}
                />
                {uploadingInvoice ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 animate-pulse font-mono text-xs">
                    <Upload className="h-3.5 w-3.5 animate-spin" /> Saving Invoice to Supabase...
                  </span>
                ) : form.uploaded_invoice_name ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 font-medium truncate text-xs">
                    <FileCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> Attached File: <strong className="truncate">{form.uploaded_invoice_name}</strong> (Click to change file)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Upload className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Drag &amp; Drop or Click to Upload Invoice
                  </span>
                )}
              </label>
            </div>
          </div>
        </div>
        {/* ========================================================================= */}
        {/* SECTION 1: HEADER FIELDS (Strict Field Order as Requested)                */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
            1. Primary Purchase Order Header Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. P.O. No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">P.O. No.</label>
              <input
                type="text"
                value={form.po_number}
                onChange={(e) => updateHeader('po_number', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                required
              />
            </div>

            {/* 2. P.O. Date* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">P.O. Date*</label>
              <input
                type="text"
                value={form.po_date}
                onChange={(e) => updateHeader('po_date', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-semibold text-foreground"
                required
              />
            </div>

            {/* 3. Name of Company* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Name of Company*</label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => updateHeader('company_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                required
              />
            </div>

            {/* 4. PAN No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">PAN No.</label>
              <input
                type="text"
                value={form.pan_no}
                onChange={(e) => updateHeader('pan_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 5. VAT No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">VAT No.</label>
              <input
                type="text"
                value={form.vat_no}
                onChange={(e) => updateHeader('vat_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 6. CST No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">CST No.</label>
              <input
                type="text"
                value={form.cst_no}
                onChange={(e) => updateHeader('cst_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 7. Cess No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Cess No.</label>
              <input
                type="text"
                value={form.cess_no}
                onChange={(e) => updateHeader('cess_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 8. Project Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Project Name</label>
              <input
                type="text"
                value={form.project_name}
                onChange={(e) => updateHeader('project_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                required
              />
            </div>

            {/* 9. Budget Applicable */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="budget_applicable"
                checked={form.budget_applicable}
                onChange={(e) => updateHeader('budget_applicable', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="budget_applicable" className="font-bold text-foreground text-xs cursor-pointer">
                Budget Applicable
              </label>
            </div>

            {/* 10. Project Address */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Project Address</label>
              <input
                type="text"
                value={form.project_address}
                onChange={(e) => updateHeader('project_address', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
                required
              />
            </div>

            {/* 11. Site Contact */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Site Contact</label>
              <input
                type="text"
                value={form.site_contact}
                onChange={(e) => updateHeader('site_contact', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 12. Supplier Name — selected from the vendor registry so the PO
                always resolves to a real vendor id. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Supplier Name</label>
              {vendorOptions.length > 0 ? (
                <select
                  value={form.supplier_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const vendor = vendorOptions.find((v) => (v.display_name || v.legal_name) === name);
                    setForm((prev) => ({
                      ...prev,
                      supplier_name: name,
                      ...(vendor ? { vendor_id: vendor.id } : {}),
                    }) as FullPoFormState);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                  required
                >
                  <option value="">Select a supplier…</option>
                  {vendorOptions.map((vendor) => (
                    <option key={vendor.id} value={vendor.display_name || vendor.legal_name}>
                      {vendor.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.supplier_name}
                  onChange={(e) => updateHeader('supplier_name', e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                  placeholder="No vendors loaded — add one in the Vendor Registry"
                  required
                />
              )}
            </div>

            {/* 13. PO in the name of* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">PO in the name of*</label>
              <input
                type="text"
                value={form.po_in_the_name_of}
                onChange={(e) => updateHeader('po_in_the_name_of', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-extrabold text-foreground"
                required
              />
            </div>

            {/* 14. Phone No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Phone No.</label>
              <input
                type="text"
                value={form.phone_no}
                onChange={(e) => updateHeader('phone_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 15. Mobile No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Mobile No.</label>
              <input
                type="text"
                value={form.mobile_no}
                onChange={(e) => updateHeader('mobile_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 16. Email ID */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Email ID</label>
              <input
                type="email"
                value={form.email_id}
                onChange={(e) => updateHeader('email_id', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
              />
            </div>

            {/* 17. Supplier Address */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Supplier Address</label>
              <input
                type="text"
                value={form.supplier_address}
                onChange={(e) => updateHeader('supplier_address', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 18. Contact Person */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Contact Person</label>
              <input
                type="text"
                value={form.contact_person}
                onChange={(e) => updateHeader('contact_person', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 19. Fax No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Fax No.</label>
              <input
                type="text"
                value={form.fax_no}
                onChange={(e) => updateHeader('fax_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 20. Contractor / Service Provider Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Contractor / Service Provider Name</label>
              <input
                type="text"
                value={form.contractor_service_provider_name}
                onChange={(e) => updateHeader('contractor_service_provider_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 21. G.R.N No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">G.R.N No.</label>
              <input
                type="text"
                value={form.grn_no_auto}
                readOnly
                className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-bold text-foreground cursor-not-allowed"
              />
            </div>

            {/* 22. From P.R. No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">From P.R. No.</label>
              <input
                type="text"
                value={form.from_pr_no}
                onChange={(e) => updateHeader('from_pr_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-primary"
              />
            </div>

            {/* 23. Comparative Statement No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Comparative Statement No.</label>
              <input
                type="text"
                value={form.comparative_statement_no}
                onChange={(e) => updateHeader('comparative_statement_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-semibold text-foreground"
              />
            </div>

            {/* 24. Company Currency */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Company Currency</label>
              <input
                type="text"
                value={form.company_currency}
                onChange={(e) => updateHeader('company_currency', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 25. Import PO */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="import_po"
                checked={form.import_po}
                onChange={(e) => updateHeader('import_po', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="import_po" className="font-bold text-foreground text-xs cursor-pointer">
                Import PO
              </label>
            </div>

            {/* 26. Import Currency Exchange Rate */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Import Currency Exchange Rate</label>
              <input
                type="number"
                step="0.01"
                value={form.import_currency_exchange_rate}
                onChange={(e) => updateHeader('import_currency_exchange_rate', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 27. Our State */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Our State</label>
              <input
                type="text"
                value={form.our_state}
                onChange={(e) => updateHeader('our_state', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 28. Vendor State */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Vendor State</label>
              <input
                type="text"
                value={form.vendor_state}
                onChange={(e) => updateHeader('vendor_state', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 29. Additional Transportation Service Tax / GST Applicable */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="additional_trans_gst"
                checked={form.additional_transportation_gst_applicable}
                onChange={(e) => updateHeader('additional_transportation_gst_applicable', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="additional_trans_gst" className="font-bold text-foreground text-xs cursor-pointer">
                Additional Transportation GST Applicable
              </label>
            </div>

            {/* 30. GST No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">GST No.</label>
              <input
                type="text"
                value={form.gst_no}
                onChange={(e) => updateHeader('gst_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 31. Location */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => updateHeader('location', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2: FIVE TABS NAVIGATION SYSTEM                                     */}
        {/* ========================================================================= */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'entries')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'entries'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Layers className="h-4 w-4" /> Purchase Order Entries ({form.items.length})
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'terms')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'terms'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <FileText className="h-4 w-4" /> Terms and Conditions
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'comparative')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'comparative'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" /> Comparative Statements ({form.comparative_statements.length})
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'advance')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'advance'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <CheckCircle2 className="h-4 w-4" /> Advance Payment ({form.advance_payments.length})
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'amendment')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'amendment'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <ShieldCheck className="h-4 w-4" /> PO Amendment ({form.po_amendments.length})
            </button>
          </div>

          {/* TAB 1: PURCHASE ORDER ENTRIES (Editable Table) */}
          {form.activeTab === 'entries' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted-foreground">
                  Purchase Order Line Entries ({form.items.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Entry Row
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 text-center">Sr</th>
                      <th className="px-3 py-3 font-bold text-primary min-w-[140px]">1. Item Group*</th>
                      <th className="px-3 py-3 font-bold text-primary min-w-[180px]">2. Item Desc*</th>
                      <th className="px-3 py-3 min-w-[110px]">3. Item Code</th>
                      <th className="px-3 py-3 font-bold text-primary min-w-[130px]">4. Item Brand*</th>
                      <th className="px-3 py-3 min-w-[160px]">5. Item Specification</th>
                      <th className="px-3 py-3 text-center min-w-[90px]">6. Open PO</th>
                      <th className="px-3 py-3 min-w-[110px]">7. Open Till Date</th>
                      <th className="px-3 py-3 text-right min-w-[100px]">8. Approved Qty</th>
                      <th className="px-3 py-3 font-bold text-primary text-center min-w-[80px]">9. Unit*</th>
                      <th className="px-3 py-3 font-bold text-primary min-w-[100px]">10. Due On*</th>
                      <th className="px-3 py-3 min-w-[140px]">11. Purchase Category</th>
                      <th className="px-3 py-3 text-right min-w-[110px]">12. Estimated Rate</th>
                      <th className="px-3 py-3 font-bold text-primary text-right min-w-[110px]">13. Basic Rate*</th>
                      <th className="px-3 py-3 text-right min-w-[100px]">14. Discount Perc.</th>
                      <th className="px-3 py-3 text-right min-w-[100px]">15. Discount Amt</th>
                      <th className="px-3 py-3 text-right min-w-[100px]">16. Rate</th>
                      <th className="px-3 py-3 min-w-[100px]">17. HSN Code</th>
                      <th className="px-3 py-3 min-w-[100px]">18. Tax Code</th>
                      <th className="px-3 py-3 text-right min-w-[120px]">19. Tax Code Amount</th>
                      <th className="px-3 py-3 text-right min-w-[110px]">20. Previous Rate</th>
                      <th className="px-3 py-3 text-right min-w-[110px]">21. Amt</th>
                      <th className="px-3 py-3 text-right min-w-[110px]">22. Freight Chgs</th>
                      <th className="px-3 py-3 text-right min-w-[130px]">23. Load / Unload Chgs</th>
                      <th className="px-3 py-3 text-right min-w-[110px]">24. Others Chgs</th>
                      <th className="px-3 py-3 text-center min-w-[110px]">25. Gst Applicable</th>
                      <th className="px-3 py-3 text-right min-w-[110px]">26. Net Amt</th>
                      <th className="px-3 py-3 text-right min-w-[130px]">27. Gst Principal Amt</th>
                      <th className="px-3 py-3 text-right min-w-[110px]">28. GRN Balance Qty</th>
                      <th className="px-3 py-3 text-right min-w-[90px]">29. GST Rate</th>
                      <th className="px-3 py-3 text-center min-w-[70px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.items.map((item, index) => (
                      <tr key={index} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                        <td className="px-3 py-2 text-center font-bold text-muted-foreground">{index + 1}</td>
                        {/* 1. Item Group* */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.item_group}
                            onChange={(e) => updateLineItem(index, 'item_group', e.target.value)}
                            className="w-32 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-semibold text-foreground"
                          />
                        </td>
                        {/* 2. Item Desc* */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.item_desc}
                            onChange={(e) => updateLineItem(index, 'item_desc', e.target.value)}
                            className="w-44 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-bold text-foreground"
                            required
                          />
                        </td>
                        {/* 3. Item Code */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.item_code}
                            onChange={(e) => updateLineItem(index, 'item_code', e.target.value)}
                            className="w-24 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                          />
                        </td>
                        {/* 4. Item Brand* */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.item_brand}
                            onChange={(e) => updateLineItem(index, 'item_brand', e.target.value)}
                            className="w-28 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-semibold text-foreground"
                          />
                        </td>
                        {/* 5. Item Specification */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.item_specification}
                            onChange={(e) => updateLineItem(index, 'item_specification', e.target.value)}
                            className="w-36 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                          />
                        </td>
                        {/* 6. Open PO */}
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={item.open_po}
                            onChange={(e) => updateLineItem(index, 'open_po', e.target.checked)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                        </td>
                        {/* 7. Open Till Date */}
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={item.open_till_date}
                            onChange={(e) => updateLineItem(index, 'open_till_date', e.target.value)}
                            className="rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        {/* 8. Approved Qty */}
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.approved_qty}
                            onChange={(e) => updateLineItem(index, 'approved_qty', Number(e.target.value))}
                            className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-xs font-bold text-foreground"
                          />
                        </td>
                        {/* 9. Unit* */}
                        <td className="px-3 py-2">
                          <select
                            value={item.unit}
                            onChange={(e) => updateLineItem(index, 'unit', e.target.value)}
                            className="rounded border border-border bg-background px-2 py-1 text-xs font-bold text-foreground"
                          >
                            <option value="BAGS">BAGS</option>
                            <option value="BAG">BAG</option>
                            <option value="MT">MT</option>
                            <option value="KG">KG</option>
                            <option value="SQFT">SQFT</option>
                            <option value="NOS">NOS</option>
                          </select>
                        </td>
                        {/* 10. Due On* */}
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={item.due_on}
                            onChange={(e) => updateLineItem(index, 'due_on', e.target.value)}
                            className="rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        {/* 11. Purchase Category */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.purchase_category}
                            onChange={(e) => updateLineItem(index, 'purchase_category', e.target.value)}
                            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        {/* 12. Estimated Rate */}
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.estimated_rate}
                            onChange={(e) => updateLineItem(index, 'estimated_rate', Number(e.target.value))}
                            className="w-24 rounded border border-border bg-background px-2 py-1 text-right text-xs"
                          />
                        </td>
                        {/* 13. Basic Rate* */}
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.basic_rate}
                            onChange={(e) => updateLineItem(index, 'basic_rate', Number(e.target.value))}
                            className="w-24 rounded border-2 border-primary/50 bg-background px-2 py-1 text-right text-xs font-extrabold text-primary"
                          />
                        </td>
                        {/* 14. Discount Perc. */}
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.discount_perc}
                            onChange={(e) => updateLineItem(index, 'discount_perc', Number(e.target.value))}
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-right text-xs"
                          />
                        </td>
                        {/* 15. Discount Amt */}
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.discount_amt}
                            onChange={(e) => updateLineItem(index, 'discount_amt', Number(e.target.value))}
                            className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-xs"
                          />
                        </td>
                        {/* 16. Rate */}
                        <td className="px-3 py-2 text-right font-extrabold text-foreground">₹{item.rate}</td>
                        {/* 17. HSN Code */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.hsn_code}
                            onChange={(e) => updateLineItem(index, 'hsn_code', e.target.value)}
                            className="w-24 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        {/* 18. Tax Code */}
                        <td className="px-3 py-2 font-sans font-semibold">{item.tax_code}</td>
                        {/* 19. Tax Code Amount */}
                        <td className="px-3 py-2 text-right text-muted-foreground">₹{item.tax_code_amount.toLocaleString()}</td>
                        {/* 20. Previous Rate */}
                        <td className="px-3 py-2 text-right text-muted-foreground">₹{item.previous_rate}</td>
                        {/* 21. Amt */}
                        <td className="px-3 py-2 text-right font-bold text-foreground">₹{item.amt.toLocaleString()}</td>
                        {/* 22. Freight Chgs */}
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={item.freight_chgs}
                            onChange={(e) => updateLineItem(index, 'freight_chgs', Number(e.target.value))}
                            className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-xs"
                          />
                        </td>
                        {/* 23. Load / Unload Chgs */}
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={item.load_unload_chgs}
                            onChange={(e) => updateLineItem(index, 'load_unload_chgs', Number(e.target.value))}
                            className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-xs"
                          />
                        </td>
                        {/* 24. Others Chgs */}
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={item.others_chgs}
                            onChange={(e) => updateLineItem(index, 'others_chgs', Number(e.target.value))}
                            className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-xs"
                          />
                        </td>
                        {/* 25. Gst Applicable */}
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={item.gst_applicable}
                            onChange={(e) => updateLineItem(index, 'gst_applicable', e.target.checked)}
                            className="h-4 w-4 rounded border-border text-primary"
                          />
                        </td>
                        {/* 26. Net Amt */}
                        <td className="px-3 py-2 text-right font-extrabold text-foreground">₹{item.net_amt.toLocaleString()}</td>
                        {/* 27. Gst Principal Amount */}
                        <td className="px-3 py-2 text-right text-muted-foreground">₹{item.gst_principal_amount.toLocaleString()}</td>
                        {/* 28. GRN Balance Qty */}
                        <td className="px-3 py-2 text-right font-bold">{item.grn_balance_qty}</td>
                        {/* 29. GST Rate */}
                        <td className="px-3 py-2 text-right font-bold">{item.gst_rate}%</td>
                        {/* Action Column */}
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLineItem(index)}
                            className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
                            title="Remove entry row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tabular Form Field Summary (Exact Specified Fields) */}
              <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-4">
                <h4 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                  Purchase Entries Commercial Summary &amp; Transportation Tax Fields
                </h4>

                <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Total Gross Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Gross Amount</label>
                    <input
                      type="text"
                      value={`₹${totalGrossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-extrabold text-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Total Tax Code Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Tax Code Amount</label>
                    <input
                      type="text"
                      value={`₹${totalTaxCodeAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-extrabold text-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Tax On Transportation Principal Amount* */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                      Tax On Transportation Principal Amount*
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.tax_on_transportation_principal_amount}
                      onChange={(e) => updateHeader('tax_on_transportation_principal_amount', Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* HSN/SAC Code for Tax On Transportation* */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                      HSN/SAC Code for Tax On Transportation*
                    </label>
                    <input
                      type="text"
                      value={form.hsn_sac_code_for_tax_on_transportation}
                      onChange={(e) => updateHeader('hsn_sac_code_for_tax_on_transportation', e.target.value)}
                      placeholder="e.g. 996511"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Tax Code for Tax On Transportation* */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                      Tax Code for Tax On Transportation*
                    </label>
                    <input
                      type="text"
                      value={form.tax_code_for_tax_on_transportation}
                      onChange={(e) => updateHeader('tax_code_for_tax_on_transportation', e.target.value)}
                      placeholder="e.g. GST 18%"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                    />
                  </div>

                  {/* Tax Code Amount for Tax On Transportation */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                      Tax Code Amount for Tax On Transportation
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.tax_code_amount_for_tax_on_transportation}
                      onChange={(e) => updateHeader('tax_code_amount_for_tax_on_transportation', Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Net Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Net Amount</label>
                    <input
                      type="text"
                      value={`₹${netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-extrabold text-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Total Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">Total Amount</label>
                    <input
                      type="text"
                      value={`₹${netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-primary text-base cursor-not-allowed"
                    />
                  </div>

                  {/* Total Discount Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Discount Amount</label>
                    <input
                      type="text"
                      value={`₹${totalDiscountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-bold text-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Loading/Unloading Charges */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Loading/Unloading Charges</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.loading_unloading_charges}
                      onChange={(e) => updateHeader('loading_unloading_charges', Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Other Charges */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Other Charges</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.other_charges}
                      onChange={(e) => updateHeader('other_charges', Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Total Amount in Words */}
                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">Total Amount in Words</label>
                    <input
                      type="text"
                      value={totalAmountInWords}
                      readOnly
                      className="w-full rounded-lg border-2 border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-extrabold text-emerald-900 dark:text-emerald-200 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TERMS AND CONDITIONS (Copy/Paste Formatted Multiline Field with Save Button) */}
          {form.activeTab === 'terms' && (
            <div className="rounded-xl border border-border p-4 bg-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h4 className="font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Terms and Conditions Master Field
                  </h4>
                  <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">
                    Paste or edit complete terms &amp; conditions with formatting and numbering
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (!po.id) return;
                    try {
                      setSavingTerms(true);
                      const textToSave = Array.isArray(form.terms_and_conditions)
                        ? form.terms_and_conditions.join('\n')
                        : (form.terms_and_conditions || '');
                      const res = await updatePurchaseOrderTermsAndConditions(po.id, textToSave);
                      if (res.error) throw res.error;
                      setTermsSaveMsg('Terms & Conditions saved successfully!');
                      setTimeout(() => setTermsSaveMsg(null), 3500);
                    } catch (err: any) {
                      setTermsSaveMsg(`Error: ${err?.message || 'Failed to save terms'}`);
                    } finally {
                      setSavingTerms(false);
                    }
                  }}
                  disabled={savingTerms}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {savingTerms ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" /> Save Terms &amp; Conditions
                    </>
                  )}
                </button>
              </div>

              {termsSaveMsg && (
                <div className={`rounded-lg border px-3.5 py-2 text-xs font-bold ${termsSaveMsg.startsWith('Error') ? 'border-red-500/30 bg-red-500/10 text-red-600' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                  {termsSaveMsg}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase text-foreground">
                  Complete Terms &amp; Conditions (Spacing &amp; Formatting Preserved)
                </label>
                <textarea
                  rows={18}
                  value={Array.isArray(form.terms_and_conditions) ? form.terms_and_conditions.join('\n') : (form.terms_and_conditions || '')}
                  onChange={(e) => {
                    const linesVal = e.target.value.split('\n');
                    setForm((prev) => ({ ...prev, terms_and_conditions: linesVal }));
                  }}
                  placeholder="Copy and paste entire Terms & Conditions text block here..."
                  className="w-full rounded-xl border border-border bg-background p-4 font-mono text-xs font-medium text-foreground focus:border-primary focus:outline-none shadow-inner leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 3: COMPARATIVE STATEMENTS (Fully Editable Table) */}
          {form.activeTab === 'comparative' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted-foreground">
                  Comparative Statements ({form.comparative_statements.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      comparative_statements: [
                        ...prev.comparative_statements,
                        {
                          sr: prev.comparative_statements.length + 1,
                          statement_no: `CS-${new Date().getFullYear()}-00${prev.comparative_statements.length + 1}`,
                          statement_date: new Date().toISOString().slice(0, 10),
                          quotation_reg_no: `QT-${new Date().getFullYear()}-00${prev.comparative_statements.length + 1}`,
                          supplier_name: form.supplier_name || 'New Supplier',
                          phone_no: '',
                          mobile_no: form.mobile_no || '',
                          credit_term_days: 45,
                          total_net_amount: 0,
                          effective_amount_status: 'Under Review',
                        },
                      ],
                    }));
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Comparative Row
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 text-center">Sr</th>
                      <th className="px-3 py-3">CS No.</th>
                      <th className="px-3 py-3">CS Date</th>
                      <th className="px-3 py-3">Quotation Reg. No.</th>
                      <th className="px-3 py-3">Supplier Name</th>
                      <th className="px-3 py-3">Phone No.</th>
                      <th className="px-3 py-3">Mobile No.</th>
                      <th className="px-3 py-3 text-center">Credit Term (Days)</th>
                      <th className="px-3 py-3 text-right">Total Net Amount (₹)</th>
                      <th className="px-3 py-3">Effective Status</th>
                      <th className="px-3 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.comparative_statements.map((cs, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle">
                        <td className="px-3 py-2 text-center font-bold text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.statement_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].statement_no = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs font-bold text-primary"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={cs.statement_date}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].statement_date = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.quotation_reg_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].quotation_reg_no = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs font-semibold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.supplier_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].supplier_name = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-40 rounded border border-border bg-background px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.phone_no || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].phone_no = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.mobile_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].mobile_no = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            value={cs.credit_term_days}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].credit_term_days = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-center font-bold"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={cs.total_net_amount}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].total_net_amount = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs text-right font-extrabold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={cs.effective_amount_status}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.comparative_statements];
                                list[idx].effective_amount_status = val;
                                return { ...prev, comparative_statements: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs font-bold text-emerald-600"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                comparative_statements: prev.comparative_statements.filter((_, i) => i !== idx),
                              }));
                            }}
                            className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: ADVANCE PAYMENT (Fully Editable Table) */}
          {form.activeTab === 'advance' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted-foreground">
                  Advance Payments ({form.advance_payments.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      advance_payments: [
                        ...prev.advance_payments,
                        {
                          sr: prev.advance_payments.length + 1,
                          voucher_no: `VCH-${new Date().getFullYear()}-00${prev.advance_payments.length + 1}`,
                          voucher_date: new Date().toISOString().slice(0, 10),
                          supplier_name: form.supplier_name || 'New Supplier',
                          po_no: form.po_number || 'PO-2026-001',
                          project_name: form.project_name || 'Pramukh Orbit 3',
                          advance_payment: 0,
                          status: 'Pending Approval',
                        },
                      ],
                    }));
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Advance Payment Row
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 text-center">Sr</th>
                      <th className="px-3 py-3">Voucher No.</th>
                      <th className="px-3 py-3">Voucher Date</th>
                      <th className="px-3 py-3">Supplier Name</th>
                      <th className="px-3 py-3">P.O. No.</th>
                      <th className="px-3 py-3">Project Name</th>
                      <th className="px-3 py-3 text-right">Advance Amount (₹)</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.advance_payments.map((adv, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle">
                        <td className="px-3 py-2 text-center font-bold text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={adv.voucher_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].voucher_no = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs font-bold text-primary"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={adv.voucher_date}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].voucher_date = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={adv.supplier_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].supplier_name = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-40 rounded border border-border bg-background px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={adv.po_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].po_no = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs font-semibold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={adv.project_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].project_name = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={adv.advance_payment}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].advance_payment = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs text-right font-extrabold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={adv.status}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.advance_payments];
                                list[idx].status = val;
                                return { ...prev, advance_payments: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                advance_payments: prev.advance_payments.filter((_, i) => i !== idx),
                              }));
                            }}
                            className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: PO AMENDMENT (Fully Editable Table) */}
          {form.activeTab === 'amendment' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted-foreground">
                  PO Amendments ({form.po_amendments.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      po_amendments: [
                        ...prev.po_amendments,
                        {
                          sr: prev.po_amendments.length + 1,
                          supplier_name: form.supplier_name || 'Supplier Name',
                          project_name: form.project_name || 'Project Name',
                          item_group: 'RCC Material',
                          item_desc: 'New Amendment Material Item',
                          item_brand: 'Standard',
                          item_remarks: 'Site Amendment',
                          unit: 'BAG',
                          approved_qty: 10,
                          grn_rcvd_qty: 0,
                          grn_balance: 10,
                          po_closed_qty: 0,
                          grn_closing_qty: 10,
                          status: 'Draft Amendment',
                        },
                      ],
                    }));
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Amendment Row
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 text-center">Sr</th>
                      <th className="px-3 py-3">Supplier Name</th>
                      <th className="px-3 py-3">Project Name</th>
                      <th className="px-3 py-3">Item Group</th>
                      <th className="px-3 py-3 min-w-[150px]">Item Desc</th>
                      <th className="px-3 py-3">Item Brand</th>
                      <th className="px-3 py-3">Remarks</th>
                      <th className="px-3 py-3 text-center">Unit</th>
                      <th className="px-3 py-3 text-right">Appr Qty</th>
                      <th className="px-3 py-3 text-right">GRN Rcvd</th>
                      <th className="px-3 py-3 text-right">GRN Closing</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.po_amendments.map((am, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle">
                        <td className="px-3 py-2 text-center font-bold text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.supplier_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].supplier_name = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.project_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].project_name = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.item_group}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].item_group = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.item_desc}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].item_desc = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-44 rounded border border-border bg-background px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.item_brand}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].item_brand = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-24 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.item_remarks}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].item_remarks = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="text"
                            value={am.unit}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].unit = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-center font-bold"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={am.approved_qty}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].approved_qty = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-right font-extrabold"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={am.grn_rcvd_qty}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].grn_rcvd_qty = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-right font-bold text-emerald-600"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={am.grn_closing_qty}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].grn_closing_qty = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-right font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={am.status}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const list = [...prev.po_amendments];
                                list[idx].status = val;
                                return { ...prev, po_amendments: list };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-2 py-1 text-xs font-bold text-primary"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                po_amendments: prev.po_amendments.filter((_, i) => i !== idx),
                              }));
                            }}
                            className="p-1.5 text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SECTION 3: FOOTER FORM TABULAR FIELDS (After all tab details end)          */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
            3. Final Order Processing &amp; Site Logistics Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* To GRN */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="to_grn"
                checked={form.to_grn}
                onChange={(e) => updateHeader('to_grn', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="to_grn" className="font-bold text-foreground text-xs cursor-pointer">
                To GRN
              </label>
            </div>

            {/* Credit Period */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Credit Period (In Days)</label>
              <input
                type="number"
                value={form.credit_period}
                onChange={(e) => updateHeader('credit_period', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Delivery Address* */}
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Delivery Address*</label>
              <textarea
                rows={2}
                value={form.delivery_address}
                onChange={(e) => updateHeader('delivery_address', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background p-2.5 font-medium text-foreground"
                required
              />
            </div>

            {/* Note On PO */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Note On PO</label>
              <input
                type="text"
                value={form.note_on_po}
                onChange={(e) => updateHeader('note_on_po', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
              />
            </div>

            {/* Remarks */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Remarks</label>
              <input
                type="text"
                value={form.remarks}
                onChange={(e) => updateHeader('remarks', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* Relation Count */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Relation Count</label>
              <input
                type="number"
                step="0.01"
                value={form.relation_count}
                onChange={(e) => updateHeader('relation_count', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Ledger Present */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Ledger Present</label>
              <input
                type="number"
                step="0.01"
                value={form.ledger_present}
                onChange={(e) => updateHeader('ledger_present', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">PO Status</label>
              <select
                value={form.status}
                onChange={async (e) => {
                  const newStatus = e.target.value as any;
                  updateHeader('status', newStatus);
                  if (po.id) {
                    await updatePurchaseOrderStatus(po.id, newStatus);
                  }
                }}
                className="w-full rounded-lg border-2 border-primary bg-background px-3 py-2 font-extrabold text-foreground cursor-pointer"
              >
                <option value="Draft">Draft (Saved for Editing)</option>
                <option value="Verification">Verification (Pending Audit Sign-off)</option>
                <option value="Issued">Issued (Sent to Vendor)</option>
                <option value="Fulfilled">Fulfilled (Material Delivered)</option>
                <option value="Cancelled">Cancelled (Revoked)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Form Action Buttons */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="flex items-center gap-4">
            {/* PRINT BUTTON AT BOTTOM LEFT CORNER */}
            <button
              type="button"
              onClick={() => onPrint ? onPrint() : printPurchaseOrderReport(form)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-all cursor-pointer"
            >
              <Printer className="h-4 w-4" /> Print
            </button>

            <div className="text-xs font-bold text-muted-foreground">
              Total PO Net Amount: <span className="font-mono text-sm text-primary font-extrabold">₹{netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-md transition-all cursor-pointer"
            >
              <FileCheck className="h-4 w-4" /> Save Purchase Order
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
