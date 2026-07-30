export interface CentralParkBillLedgerRow {
  id: string;
  headActivity: string;
  subActivityLedger: string;
  supplierName: string;
  accountingDate: string;
  billDateOfSupplier: string;
  billNo: string;
  billNoOfSupplier: string;
  remarks: string;
  itemGroup: string;
  itemDesc: string;
  unit: string;
  receivedQty: number;
  finalBillRate: number;
  billItemAmt: number;
  advancePayment: number;
  expectedPayment: number;
  jvPayment: number;
  finalBillAmount: number;
  poNo: string;
  poRate: number;
  noteOnPo: string;
  prNo: string;
  gstRate: string;
}

export const CENTRAL_PARK_BILL_LEDGER_DATA: CentralParkBillLedgerRow[] = [
  {
    "id": "ledger-cp-1",
    "headActivity": "Site Development / Pre Construction Works",
    "subActivityLedger": "Temporary Site Barrication/Pre.Const. Work",
    "supplierName": "T S TRADERS",
    "accountingDate": "2026-05-04 00:00:00",
    "billDateOfSupplier": "2026-05-04 00:00:00",
    "billNo": "INV-CP-2026-001",
    "billNoOfSupplier": "82",
    "remarks": "AS PER INVOICE NO - 82 DATED - 04.05.2026 FOR SITE BARRICADING MS PIPE",
    "itemGroup": "FABRICATION WORK",
    "itemDesc": "Temporary Site Barrication/Pre.Const. Work",
    "unit": "LS",
    "receivedQty": 1,
    "finalBillRate": 500000,
    "billItemAmt": 500000,
    "advancePayment": 0,
    "expectedPayment": 500000,
    "jvPayment": 0,
    "finalBillAmount": 500000,
    "poNo": "PO-CP-001-CIV-001",
    "poRate": 500000,
    "noteOnPo": "Approved by Project Manager",
    "prNo": "PR-CP-001-001",
    "gstRate": "18%"
  }
];
