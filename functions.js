module.exports = function () {
  const DEFAULT_COUNTRY = "Sweden";
  let taxCategory = "S"; //Used in tax object and invoice lines. Becomes "E" if no tax

  // Recursivley replace empty values with null for keepNullNodes: false
  this.emptyValueToNull = function (obj) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value == "object") {
        emptyValueToNull(value);
      }
      if (typeof value == "string" && value.match(/^\s*$/) !== null) {
        obj[key] = null;
      }
    }
  };

  // Recursively format values marked with underscore to numbers
  this.formatValuesInObject = function (obj) {
    for (const key in obj) {
      if (Array.isArray(obj[key])) {
        obj[key].forEach((value) => formatValuesInObject(value));
      }
      if (key.match(/_/)?.length > 0) {
        obj[key] = formatToNumber(obj[key]);
      }
    }
  };
  function formatToNumber(value) {
    // remove whitespace
    let formattedValue = value.replace(/\s/g, "");
    // decimal point
    formattedValue = formattedValue.replace(/,/g, ".");
    // remove %
    formattedValue = formattedValue.replace(/%/g, "");
    // convert to number
    formattedValue = Number(formattedValue);
    return formattedValue;
  }

  this.getUnitCode = function (unit) {
    let unitCode = "EA";
    switch (unit.toLowerCase()) {
      case "percent":
      case "procent":
        unitCode = "P1";
        break;
      case "fixed rate":
      case "fast summa":
        unitCode = "1I";
        break;
      case "minutes":
      case "minuter":
        unitCode = "MIN";
        break;
      case "words":
      case "ord":
        unitCode = "D68";
        break;
      case "hours":
      case "timmar":
        unitCode = "HUR";
        break;
    }
    return unitCode;
  };

  this.createInvoiceTemplate = function (obj) {
    const orderRef = obj.invoicePO ? { "cbc:ID": obj.invoicePO } : null;
    return {
      Invoice: {
        "@": {
          "xmlns:cac":
            "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
          "xmlns:cbc":
            "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
          xmlns: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
        },
        "cbc:CustomizationID":
          "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
        "cbc:ProfileID": "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
        "cbc:ID": obj.invoiceNumber,
        "cbc:IssueDate": obj.invoiceDate,
        "cbc:DueDate": obj.dueDate,
        "cbc:InvoiceTypeCode": "380",
        "cbc:Note": obj.invoiceProjectName,
        "cbc:DocumentCurrencyCode": obj.currency,
        //"cbc:AccountingCost": obj.invoiceCostCenter,
        "cbc:BuyerReference": obj.invoiceCostCenter,
        "cac:OrderReference": orderRef,
      },
    };
  };

  this.createCreditNoteTemplate = function (obj) {
    const creditBillRef = obj.invoiceNo
      ? { "cac:InvoiceDocumentReference": { "cbc:ID": obj.invoiceNo } }
      : null;
    const creditBuyRef = obj.creditPO
      ? obj.creditPO
      : obj.invoiceNo
        ? obj.invoiceNo
        : "Ref";
    return {
      CreditNote: {
        "@": {
          "xmlns:cac":
            "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
          "xmlns:cbc":
            "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
          xmlns: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
        },
        "cbc:CustomizationID":
          "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
        "cbc:ProfileID": "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
        "cbc:ID": obj.creditNoteNumber,
        "cbc:IssueDate": obj.creditDate,
        "cbc:CreditNoteTypeCode": "381",
        "cbc:Note": obj.creditProjectName,
        "cbc:DocumentCurrencyCode": obj.currency,
        "cbc:BuyerReference": creditBuyRef,
        "cac:BillingReference": creditBillRef,
      },
    };
  };

  this.formatCreditNoteItems = function (obj) {
    let cdnVAT = 0; //Default if no VATTotals exist
    let cdnVAT1;
    let cdnVAT2;
    let twoVATRatesExist = false;
    let totalsWithVAT2 = [];

    if (obj.VATTotals.length == 1) {
      cdnVAT = obj.VATTotals[0].VATRate_;
    }

    // if two VAT rates exist, find a subset of itemTotals
    // that equals the VAT Base for VAT 2
    if (obj.VATTotals.length == 2) {
      cdnVAT1 = obj.VATTotals[0].VATRate_;
      cdnVAT2 = obj.VATTotals[1].VATRate_;
      const VATBase2 = obj.VATTotals[1].VATBase_;
      twoVATRatesExist = true;
      let totalsArray = [];
      obj.items.forEach((item) => {
        if (item.itemTotal_) {
          totalsArray.push(item.itemTotal_);
        }
      });
      totalsWithVAT2 = getSubset(totalsArray, VATBase2).flat();
      //  console.log(totalsWithVAT2);
    }

    const currency = obj.currency;
    let currentItem;
    obj.items.forEach((item) => {
      // Manual credit note
      const subjectMatch = item.itemSubject.match(/^(\d+\.)\t(.+)/);
      // Credit note from invoice
      const otherMatch = item.itemSubject.match(
        /^(\d+)(\s([a-z%]+).+?)([0-9\s,]+)$/,
      );
      // if 2 VAT rates, check if item total is in subset
      // if yes set VAT to VAT 2 and delete found total from subset
      if (twoVATRatesExist) {
        cdnVAT = cdnVAT1;
        if (
          totalsWithVAT2.length > 0 &&
          totalsWithVAT2.includes(item.itemTotal_)
        ) {
          cdnVAT = cdnVAT2;
          const index = totalsWithVAT2.indexOf(item.itemTotal_);
          totalsWithVAT2.splice(index, 1);
        }
      }
      if (subjectMatch) {
        currentItem = item;
        item.itemPriceLines = [];
        const itemNo = subjectMatch[1];
        item.itemNumber = itemNo;
        item.itemDescription = subjectMatch[2];
        if (item.itemTotal_) {
          const itemPriceLine = {
            linePriceQuantity_: "1",
            linePriceName: subjectMatch[2],
            linePriceUnit: "EA",
            linePrice: item.itemTotal_ + " " + currency,
            linePriceOnly_: item.itemTotal_,
            linePriceTotal_: item.itemTotal_,
            linePriceVATRate_: cdnVAT,
          };
          currentItem.itemPriceLines.push(itemPriceLine);
        }
      }
      if (otherMatch) {
        item.skip = true;
        const itemPriceLine = {
          linePriceQuantity_: otherMatch[1],
          linePriceName: otherMatch[2],
          linePriceUnit: otherMatch[3],
          linePrice: otherMatch[4] + currency,
          linePriceOnly_: formatToNumber(otherMatch[4]),
          linePriceTotal_: item.itemTotal_,
          linePriceVATRate_: cdnVAT,
        };
        currentItem.itemPriceLines.push(itemPriceLine);
      }
    });
  };

  function getSubset(array, sum) {
    function fork(i = 0, s = 0, t = []) {
      if (result.length > 0) {
        return;
      }
      if (s === sum) {
        result.push(t);
        return;
      }
      if (i === array.length) {
        return;
      }
      if (s + array[i] <= sum) {
        // shout circuit for positive numbers only
        fork(i + 1, s + array[i], t.concat(array[i]));
      }
      fork(i + 1, s, t);
    }
    let result = [];
    fork();
    return result;
  }

  this.createInvoiceLinesFromItems = function (obj, quantityKey) {
    let documentLineArray = [];
    obj.items.forEach((item) => {
      // skippable item from credit note
      if (item.skip) {
        return;
      }
      const itemNumberStr = item.itemNumber;
      // index number for lines
      let lineNumber = 1;
      item.itemPriceLines.forEach((priceLine) => {
        // return if quantity is 0 (e.g. subtotals)
        if (priceLine.linePriceQuantity_ == 0) {
          return;
        }
        // Non-invoiced items
        // if (priceLine.linePriceTotal_ == 0) {return};

        // Add item no + index to lines
        priceLine.lineID = itemNumberStr + lineNumber.toString();
        lineNumber++;

        // % surcharge or discount
        if (priceLine.linePriceOnly_ == 0) {
          priceLine.linePriceOnly_ = (
            priceLine.linePriceTotal_ / priceLine.linePriceQuantity_
          ).toFixed(2);
          if (isNaN(priceLine.linePriceOnly_)) {
            priceLine.linePriceOnly_ = 0;
          }
        }

        let documentLine = {};
        documentLine["cbc:ID"] = priceLine.lineID;
        documentLine[quantityKey] = {
          "@unitCode": getUnitCode(priceLine.linePriceUnit),
          "#": priceLine.linePriceQuantity_,
        };
        documentLine["cbc:LineExtensionAmount"] = {
          "@currencyID": obj.currency,
          "#": priceLine.linePriceTotal_,
        };
        documentLine["cbc:AccountingCost"] = item.itemCostCenter;
        // conditional to prevent empty OrderLineReference
        if (item.itemPO) {
          documentLine["cac:OrderLineReference"] = {
            "cbc:LineID": item.itemPO,
          };
        }
        documentLine["cac:Item"] = {
          "cbc:Description": item.itemDescription,
          "cbc:Name": `${priceLine.linePriceQuantity_.toString()} ${
            priceLine.linePriceName
          } ${priceLine.linePrice} `,
          "cac:ClassifiedTaxCategory": {
            "cbc:ID": taxCategory,
            "cbc:Percent": priceLine.linePriceVATRate_,
            "cac:TaxScheme": {
              "cbc:ID": "VAT",
            },
          },
        };
        documentLine["cac:Price"] = {
          "cbc:PriceAmount": {
            "@currencyID": obj.currency,
            "#": priceLine.linePriceOnly_,
          },
        };

        documentLineArray.push(documentLine);
      });
    });
    return documentLineArray;
  };

  this.createParty = function (obj) {
    const countryCode = getCountryCode(obj.country);
    let schemeNo;
    let IdNr;

    switch (countryCode) {
      case "SE":
        schemeNo = "0007";
        IdNr = obj.VATId.substring(2, 12);
        break;
      case "FI":
        schemeNo = "0213";
        IdNr = obj.VATId;
        break;
      default:
        schemeNo = "0088";
        IdNr = obj.GLN;
    }

    const partyObj = {
      "cac:Party": {
        "cbc:EndpointID": {
          "@": {
            schemeID: schemeNo,
          },
          "#": IdNr,
        },
        "cac:PartyIdentification": {
          "cbc:ID": {
            "@": {
              schemeID: schemeNo,
            },
            "#": IdNr,
          },
        },
        "cac:PartyName": {
          "cbc:Name": obj.name,
        },
        "cac:PostalAddress": {
          "cbc:StreetName": obj.addressLine1,
          "cbc:AdditionalStreetName": obj.addressLine2,
          "cbc:CityName": obj.city,
          "cbc:PostalZone": obj.postalCode,
          "cac:Country": {
            "cbc:IdentificationCode": countryCode,
          },
        },
        "cac:PartyTaxScheme": {
          "cbc:CompanyID": obj.VATId,
          "cac:TaxScheme": {
            "cbc:ID": "VAT",
          },
        },
        "cac:PartyLegalEntity": {
          "cbc:RegistrationName": obj.name,
          "cbc:CompanyID": {
            "@": {
              schemeID: schemeNo,
            },
            "#": IdNr,
          },
        },
        "cac:Contact": {
          "cbc:Name": obj.contactName,
          "cbc:Telephone": obj.contactPhone,
          "cbc:ElectronicMail": obj.contactEmail,
        },
      },
    };
    // Remove party contact if name is blank
    if (partyObj["cac:Party"]["cac:Contact"]["cbc:Name"] == null) {
      partyObj["cac:Party"]["cac:Contact"] = null;
    }
    return partyObj;
  };

  this.createGiroPayment = function (obj) {
    const paymentObj = {
      "cac:PaymentMeans": {
        "cbc:PaymentMeansCode": {
          //"@name": "Bankgiro",
          "#": "30",
        },
        "cbc:PaymentID": obj.invoiceNumber,
        "cac:PayeeFinancialAccount": {
          "cbc:ID": obj.seller.bankgiro_no,
          //"cbc:Name": "AccountName",
          "cac:FinancialInstitutionBranch": {
            "cbc:ID": "SE:BANKGIRO",
          },
        },
      },
    };
    return paymentObj;
  };

  this.createIBANPayment = function (obj) {
    const paymentObj = {
      "cac:PaymentMeans": {
        "cbc:PaymentMeansCode": {
          //"@name": "IBAN",
          "#": "30",
        },
        "cbc:PaymentID": obj.invoiceNumber,
        "cac:PayeeFinancialAccount": {
          "cbc:ID": obj.seller.IBAN,
          //"cbc:Name": "AccountName",
          "cac:FinancialInstitutionBranch": {
            "cbc:ID": obj.seller.SWIFTBIC,
          },
        },
      },
    };
    return paymentObj;
  };

  this.createTaxObject = function (obj) {
    const taxObj = {
      "cac:TaxTotal": {
        "cbc:TaxAmount": {
          "@currencyID": obj.currency,
          "#": (obj.grossTotal_ - obj.netTotal_).toFixed(2),
        },
      },
    };
    let exemptionReason = null;
    // if tax exempt, there will be no VAT Totals
    if (obj.VATTotals.length === 0) {
      taxCategory = "E";
      exemptionReason = "Exempt";
      const noVATObj = {
        VATBase_: obj.grossTotal_,
        VATRate_: "0",
        VATAmount_: "0",
      };
      obj.VATTotals.push(noVATObj);
    }
    const VATSubtotals = [];

    obj.VATTotals.forEach((VAT) => {
      const VATObj = {
        "cbc:TaxableAmount": {
          "@currencyID": obj.currency,
          "#": VAT.VATBase_,
        },
        "cbc:TaxAmount": {
          "@currencyID": obj.currency,
          "#": VAT.VATAmount_,
        },
        "cac:TaxCategory": {
          "cbc:ID": taxCategory,
          "cbc:Percent": VAT.VATRate_,
          "cbc:TaxExemptionReason": exemptionReason,
          "cac:TaxScheme": {
            "cbc:ID": "VAT",
          },
        },
      };

      VATSubtotals.push(VATObj);
      taxObj["cac:TaxTotal"]["cac:TaxSubtotal"] = VATSubtotals;
      // console.log(taxObj);
    });
    return taxObj;
  };

  this.createTotalsObject = function (obj) {
    const totals = {
      "cac:LegalMonetaryTotal": {
        "cbc:LineExtensionAmount": {
          "@currencyID": obj.currency,
          "#": obj.netTotal_,
        },
        "cbc:TaxExclusiveAmount": {
          "@currencyID": obj.currency,
          "#": obj.netTotal_,
        },
        "cbc:TaxInclusiveAmount": {
          "@currencyID": obj.currency,
          "#": obj.grossTotal_,
        },
        "cbc:PayableAmount": {
          "@currencyID": obj.currency,
          "#": obj.grossTotal_,
        },
      },
    };
    return totals;
  };

  this.getCountryCode = function (country) {
    if (country == null) {
      country = DEFAULT_COUNTRY;
    }
    const countryMap = new Map([
      ["Sverige", "SE"],
      ["Afghanistan", "AF"],
      ["Åland Islands", "AX"],
      ["Albania", "AL"],
      ["Algeria", "DZ"],
      ["American Samoa", "AS"],
      ["AndorrA", "AD"],
      ["Angola", "AO"],
      ["Anguilla", "AI"],
      ["Antarctica", "AQ"],
      ["Antigua and Barbuda", "AG"],
      ["Argentina", "AR"],
      ["Armenia", "AM"],
      ["Aruba", "AW"],
      ["Australia", "AU"],
      ["Austria", "AT"],
      ["Azerbaijan", "AZ"],
      ["Bahamas", "BS"],
      ["Bahrain", "BH"],
      ["Bangladesh", "BD"],
      ["Barbados", "BB"],
      ["Belarus", "BY"],
      ["Belgium", "BE"],
      ["Belize", "BZ"],
      ["Benin", "BJ"],
      ["Bermuda", "BM"],
      ["Bhutan", "BT"],
      ["Bolivia", "BO"],
      ["Bosnia and Herzegovina", "BA"],
      ["Botswana", "BW"],
      ["Bouvet Island", "BV"],
      ["Brazil", "BR"],
      ["British Indian Ocean Territory", "IO"],
      ["Brunei Darussalam", "BN"],
      ["Bulgaria", "BG"],
      ["Burkina Faso", "BF"],
      ["Burundi", "BI"],
      ["Cambodia", "KH"],
      ["Cameroon", "CM"],
      ["Canada", "CA"],
      ["Cape Verde", "CV"],
      ["Cayman Islands", "KY"],
      ["Central African Republic", "CF"],
      ["Chad", "TD"],
      ["Chile", "CL"],
      ["China", "CN"],
      ["Christmas Island", "CX"],
      ["Cocos (Keeling) Islands", "CC"],
      ["Colombia", "CO"],
      ["Comoros", "KM"],
      ["Congo", "CG"],
      ["Congo, The Democratic Republic of the", "CD"],
      ["Cook Islands", "CK"],
      ["Costa Rica", "CR"],
      ['Cote D"Ivoire', "CI"],
      ["Croatia", "HR"],
      ["Cuba", "CU"],
      ["Cyprus", "CY"],
      ["Czech Republic", "CZ"],
      ["Denmark", "DK"],
      ["Djibouti", "DJ"],
      ["Dominica", "DM"],
      ["Dominican Republic", "DO"],
      ["Ecuador", "EC"],
      ["Egypt", "EG"],
      ["El Salvador", "SV"],
      ["Equatorial Guinea", "GQ"],
      ["Eritrea", "ER"],
      ["Estonia", "EE"],
      ["Ethiopia", "ET"],
      ["Falkland Islands (Malvinas)", "FK"],
      ["Faroe Islands", "FO"],
      ["Fiji", "FJ"],
      ["Finland", "FI"],
      ["France", "FR"],
      ["French Guiana", "GF"],
      ["French Polynesia", "PF"],
      ["French Southern Territories", "TF"],
      ["Gabon", "GA"],
      ["Gambia", "GM"],
      ["Georgia", "GE"],
      ["Germany", "DE"],
      ["Ghana", "GH"],
      ["Gibraltar", "GI"],
      ["Greece", "GR"],
      ["Greenland", "GL"],
      ["Grenada", "GD"],
      ["Guadeloupe", "GP"],
      ["Guam", "GU"],
      ["Guatemala", "GT"],
      ["Guernsey", "GG"],
      ["Guinea", "GN"],
      ["Guinea-Bissau", "GW"],
      ["Guyana", "GY"],
      ["Haiti", "HT"],
      ["Heard Island and Mcdonald Islands", "HM"],
      ["Holy See (Vatican City State)", "VA"],
      ["Honduras", "HN"],
      ["Hong Kong", "HK"],
      ["Hungary", "HU"],
      ["Iceland", "IS"],
      ["India", "IN"],
      ["Indonesia", "ID"],
      ["Iran, Islamic Republic Of", "IR"],
      ["Iraq", "IQ"],
      ["Ireland", "IE"],
      ["Isle of Man", "IM"],
      ["Israel", "IL"],
      ["Italy", "IT"],
      ["Jamaica", "JM"],
      ["Japan", "JP"],
      ["Jersey", "JE"],
      ["Jordan", "JO"],
      ["Kazakhstan", "KZ"],
      ["Kenya", "KE"],
      ["Kiribati", "KI"],
      ['Korea, Democratic People"S Republic of', "KP"],
      ["Korea, Republic of", "KR"],
      ["Kuwait", "KW"],
      ["Kyrgyzstan", "KG"],
      ['Lao People"S Democratic Republic', "LA"],
      ["Latvia", "LV"],
      ["Lebanon", "LB"],
      ["Lesotho", "LS"],
      ["Liberia", "LR"],
      ["Libyan Arab Jamahiriya", "LY"],
      ["Liechtenstein", "LI"],
      ["Lithuania", "LT"],
      ["Luxembourg", "LU"],
      ["Macao", "MO"],
      ["Macedonia, The Former Yugoslav Republic of", "MK"],
      ["Madagascar", "MG"],
      ["Malawi", "MW"],
      ["Malaysia", "MY"],
      ["Maldives", "MV"],
      ["Mali", "ML"],
      ["Malta", "MT"],
      ["Marshall Islands", "MH"],
      ["Martinique", "MQ"],
      ["Mauritania", "MR"],
      ["Mauritius", "MU"],
      ["Mayotte", "YT"],
      ["Mexico", "MX"],
      ["Micronesia, Federated States of", "FM"],
      ["Moldova, Republic of", "MD"],
      ["Monaco", "MC"],
      ["Mongolia", "MN"],
      ["Montserrat", "MS"],
      ["Morocco", "MA"],
      ["Mozambique", "MZ"],
      ["Myanmar", "MM"],
      ["Namibia", "NA"],
      ["Nauru", "NR"],
      ["Nepal", "NP"],
      ["Netherlands", "NL"],
      ["Netherlands Antilles", "AN"],
      ["New Caledonia", "NC"],
      ["New Zealand", "NZ"],
      ["Nicaragua", "NI"],
      ["Niger", "NE"],
      ["Nigeria", "NG"],
      ["Niue", "NU"],
      ["Norfolk Island", "NF"],
      ["Northern Mariana Islands", "MP"],
      ["Norway", "NO"],
      ["Oman", "OM"],
      ["Pakistan", "PK"],
      ["Palau", "PW"],
      ["Palestinian Territory, Occupied", "PS"],
      ["Panama", "PA"],
      ["Papua New Guinea", "PG"],
      ["Paraguay", "PY"],
      ["Peru", "PE"],
      ["Philippines", "PH"],
      ["Pitcairn", "PN"],
      ["Poland", "PL"],
      ["Portugal", "PT"],
      ["Puerto Rico", "PR"],
      ["Qatar", "QA"],
      ["Reunion", "RE"],
      ["Romania", "RO"],
      ["Russian Federation", "RU"],
      ["RWANDA", "RW"],
      ["Saint Helena", "SH"],
      ["Saint Kitts and Nevis", "KN"],
      ["Saint Lucia", "LC"],
      ["Saint Pierre and Miquelon", "PM"],
      ["Saint Vincent and the Grenadines", "VC"],
      ["Samoa", "WS"],
      ["San Marino", "SM"],
      ["Sao Tome and Principe", "ST"],
      ["Saudi Arabia", "SA"],
      ["Senegal", "SN"],
      ["Serbia and Montenegro", "CS"],
      ["Seychelles", "SC"],
      ["Sierra Leone", "SL"],
      ["Singapore", "SG"],
      ["Slovakia", "SK"],
      ["Slovenia", "SI"],
      ["Solomon Islands", "SB"],
      ["Somalia", "SO"],
      ["South Africa", "ZA"],
      ["South Georgia and the South Sandwich Islands", "GS"],
      ["Spain", "ES"],
      ["Sri Lanka", "LK"],
      ["Sudan", "SD"],
      ["Suriname", "SR"],
      ["Svalbard and Jan Mayen", "SJ"],
      ["Swaziland", "SZ"],
      ["Sweden", "SE"],
      ["Switzerland", "CH"],
      ["Syrian Arab Republic", "SY"],
      ["Taiwan, Province of China", "TW"],
      ["Tajikistan", "TJ"],
      ["Tanzania, United Republic of", "TZ"],
      ["Thailand", "TH"],
      ["Timor-Leste", "TL"],
      ["Togo", "TG"],
      ["Tokelau", "TK"],
      ["Tonga", "TO"],
      ["Trinidad and Tobago", "TT"],
      ["Tunisia", "TN"],
      ["Turkey", "TR"],
      ["Turkmenistan", "TM"],
      ["Turks and Caicos Islands", "TC"],
      ["Tuvalu", "TV"],
      ["Uganda", "UG"],
      ["Ukraine", "UA"],
      ["United Arab Emirates", "AE"],
      ["United Kingdom", "GB"],
      ["United States", "US"],
      ["United States Minor Outlying Islands", "UM"],
      ["Uruguay", "UY"],
      ["Uzbekistan", "UZ"],
      ["Vanuatu", "VU"],
      ["Venezuela", "VE"],
      ["Viet Nam", "VN"],
      ["Virgin Islands, British", "VG"],
      ["Virgin Islands, U.S.", "VI"],
      ["Wallis and Futuna", "WF"],
      ["Western Sahara", "EH"],
      ["Yemen", "YE"],
      ["Zambia", "ZM"],
      ["Zimbabwe", "ZW"],
    ]);
    return countryMap.get(country);
  };
};
