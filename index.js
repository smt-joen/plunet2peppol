let WORKING_FOLDER = process.cwd();
let OUTPUT_FOLDER = WORKING_FOLDER;

const fs = require("fs");
const path = require("path");
const { create, fragment } = require("xmlbuilder2");
require("./functions.js")();

let documentArray = [];

// Read input. If first argument is folder, use as working folder
// If arguments are files, use as input
const inputArgArr = process.argv.slice(2);
if (inputArgArr.length > 0) {
  if (fs.statSync(inputArgArr[0]).isDirectory()) {
    WORKING_FOLDER = inputArgArr[0];
    OUTPUT_FOLDER = WORKING_FOLDER;
  } else {
    inputArgArr.forEach((inputArg) => {
      if (path.extname(inputArg) == ".js") {
        const argObj = require(inputArg);
        OUTPUT_FOLDER = path.dirname(inputArg);
        const outputFileName =
          path.basename(inputArg, path.extname(inputArg)) + ".xml";
        const argOutput = path.join(OUTPUT_FOLDER, outputFileName);
        const argDoc = [argObj, argOutput];
        documentArray.push(argDoc);
      }
    });
  }
  console.log("Argument");
}

// If no arguments are given, look in cwd for .js files
if (documentArray.length < 1) {
  const files = fs.readdirSync(WORKING_FOLDER);
  files.forEach((file) => {
    if (path.extname(file) == ".js") {
      const documentPath = path.join(WORKING_FOLDER, file);
      const documentObj = require(documentPath);
      const outputFileName = path.basename(file, path.extname(file)) + ".xml";
      const outputDocument = path.join(OUTPUT_FOLDER, outputFileName);
      documentArray.push([documentObj, outputDocument]);
    }
  });
  console.log("Folder files");
}

documentArray.forEach((document) => {
  const outputXML = document[1];

  const inv = document[0].inv;
  const cdn = document[0].cdn;

  // Create PEPPOL BIS 3 Invoice from input
  if (inv) {
    formatValuesInObject(inv);
    emptyValueToNull(inv);
    const seller = inv.seller;

    if (inv.invoicePO == null && inv.invoiceCostCenter == null) {
      console.log("MISSING BUYER REF/PO");
      return;
    }

    if (inv.VATId == null && inv.GLN == null) {
      console.log("MISSING BUYER ID");
      return;
    }

    const invoiceTemplateObj = createInvoiceTemplate(inv);

    let createdInvFrObj = create(
      { encoding: "UTF-8", keepNullNodes: false },
      invoiceTemplateObj,
    );

    const sellerObj = createParty(seller);

    const buyerObj = createParty(inv);

    const paymentObj1 = createGiroPayment(inv);
    const paymentObj2 = createIBANPayment(inv);

    const taxObject = createTaxObject(inv);

    const totalsObj = createTotalsObject(inv);

    const invoiceLineObj = createInvoiceLinesFromItems(
      inv,
      "cbc:InvoicedQuantity",
    );

    const sellerInfo = fragment(
      { keepNullNodes: false },
      { "cac:AccountingSupplierParty": sellerObj },
    );
    const buyerInfo = fragment(
      { keepNullNodes: false },
      { "cac:AccountingCustomerParty": buyerObj },
    );
    const paymentMeans1 = fragment({ keepNullNodes: false }, paymentObj1);
    const paymentMeans2 = fragment({ keepNullNodes: false }, paymentObj2);
    const taxTotal = fragment({ keepNullNodes: false }, taxObject);
    const total = fragment({ keepNullNodes: false }, totalsObj);
    const invoiceLines = fragment(
      { keepNullNodes: false },
      { "cac:InvoiceLine": invoiceLineObj },
    );

    createdInvFrObj.root().import(sellerInfo);
    createdInvFrObj.root().import(buyerInfo);
    createdInvFrObj.root().import(paymentMeans1);
    createdInvFrObj.root().import(paymentMeans2);
    createdInvFrObj.root().import(taxTotal);
    createdInvFrObj.root().import(total);
    createdInvFrObj.root().import(invoiceLines);

    const xmlNew = createdInvFrObj.end({ prettyPrint: true });
    // console.log(xmlNew);
    fs.writeFileSync(outputXML, xmlNew);
  }

  if (cdn) {
    formatValuesInObject(cdn);
    emptyValueToNull(cdn);
    formatCreditNoteItems(cdn);

    const seller = cdn.seller;

    if (cdn.creditPO == null && cdn.invoiceNo == null) {
      console.log("MISSING INVOICE REF/PO");
      return;
    }

    if (cdn.VATId == null && cdn.GLN == null) {
      console.log("MISSING BUYER ID");
      return;
    }

    const creditNoteTemplate = createCreditNoteTemplate(cdn);

    creditNoteTemplate.CreditNote["cac:AccountingSupplierParty"] =
      createParty(seller);
    creditNoteTemplate.CreditNote["cac:AccountingCustomerParty"] =
      createParty(cdn);
    Object.assign(creditNoteTemplate.CreditNote, createTaxObject(cdn));
    Object.assign(creditNoteTemplate.CreditNote, createTotalsObject(cdn));
    creditNoteTemplate.CreditNote["cac:CreditNoteLine"] =
      createInvoiceLinesFromItems(cdn, "cbc:CreditedQuantity");

    const createdCreditNoteFrObj = create(
      { encoding: "UTF-8", keepNullNodes: false },
      creditNoteTemplate,
    );

    const xmlNew = createdCreditNoteFrObj.end({ prettyPrint: true });
    // console.log(xmlNew);
    fs.writeFileSync(outputXML, xmlNew);
  }
});
