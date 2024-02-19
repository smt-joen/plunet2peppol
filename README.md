# plunet2peppol

plunet2peppol is a Node app that takes Plunet invoice and credit note output and creates PEPPOL BIS 3

## Instructions

* Requires Node > v16
* Clone repo and run `npm install` to install dependency
* Copy RTF templates from `/Additional_files` to applicable template set in Plunet
    - Template language must be English
    - Template set must have date format YYYY-MM-DD
    - Number format should be "12345.67". The included formatting function can also handle formats "12 345,67" and "12 345.67"
    - The template set must do no rounding of numbers
    - Invoice template is provided as Additional document1. "Show prices" must be ticked for the Additional document. Alternatively, the template can be saved as a regular invoice template in the set
    - Company name and info must be hard coded into the templates in the `seller` object. Country should be in English.
    - PayPal field in customer profile in Plunet is used for GLN in the template
* RTF output must be converted to a Javascript file; UTF-8 text file with extension `.js`. This is not handled by this app.
* The app can be called in three ways:
    1.  `.js` file as argument:
`node /path/to/plunet2peppol /other/path/to/Additional1-I-123456.js`
Converts selected file to PEPPOL BIS 3
    2.  folder as argument:
`node /path/to/plunet2peppol /other/path/to/folder_containing_js_files`
Converts `.js` files in `/folder_containing_js_files` to PEPPOL BIS 3
    3. Without argument: `node /path/to/plunet2peppol`
Converts `js` files in current working directory to PEPPOL BIS 3


## Caveats
The conversion has only been tested with a limited set of invoices and credit notes, and only involving a Swedish seller. For other territories, there are bound to be requirements regarding identification, VAT etc. that are missing from this app that will cause the resulting XML to fail validation.
For instance, mixing items with exempt and non-exempt VAT in one invoice will produce a non-valid XML. Also, having more than two VAT rates in a credit note will fail.

Validate the XMLs here (requires registration): [PEPPOL Validator](https://pagero.validex.net/en/login)

Check documentation to figure out error codes and other requirements: [PEPPOL BIS 3 documentation](https://docs.peppol.eu/poacc/billing/3.0/)

The heavy lifting of this app is done by [xmlbuilder2](https://oozcitak.github.io/xmlbuilder2/). Besides converting JSON to XML, it can also do the inverse, to help figure out how the Javascript object should be structured, based on an existing, valid XML.
