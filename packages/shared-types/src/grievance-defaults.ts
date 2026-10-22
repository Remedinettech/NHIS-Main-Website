import type { AdminPageValues } from './admin.types';
import type { Locale, PageSection } from './content.types';

/**
 * English beneficiary sections exactly as the live site (https://www.tn-nhis.net/grievances) shows them on 19 October 2026,
 * including two slips that are on the live page: the HITPA paragraph reads "...mail to tnnhisgrievance" followed by the link
 * tnnhisgrievance@hitpa.co.in, and the Vidal paragraph has no space between its link and "and". They are kept as published;
 * correct them in the Admin when the live text is corrected. Keep the existing section ids (anchors).
 * Applied only through an explicit Admin action, never silently.
 */
export const CURRENT_GRIEVANCE_BENEFICIARIES: PageSection[] = [
  {
    id: 'mdindia-tpa',
    key: 'mdindia-tpa',
    heading: 'HITPA Beneficiary',
    blocks: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'For all your grievances and Short settlement cases. Please mail to tnnhisgrievance'
          },
          {
            type: 'mail',
            address: 'tnnhisgrievance@hitpa.co.in'
          },
          {
            type: 'text',
            text: ' and '
          },
          {
            type: 'mail',
            address: '010600@uiic.co.in'
          }
        ]
      }
    ]
  },
  {
    id: 'medi-assist-tpa',
    key: 'medi-assist-tpa',
    heading: 'Medi Assist TPA Beneficiary',
    blocks: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'For all your grievances and Short settlement cases. please mail to '
          },
          {
            type: 'mail',
            address: 'tnnhisgrievance@mediassist.in'
          },
          {
            type: 'text',
            text: ' and '
          },
          {
            type: 'mail',
            address: '010600@uiic.co.in'
          }
        ]
      }
    ]
  },
  {
    id: 'vidal-health-tpa',
    key: 'vidal-health-tpa',
    heading: 'VIDAL HEALTH TPA Beneficiary',
    blocks: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'For all your grievances and Short settlement cases. Please mail to '
          },
          {
            type: 'mail',
            address: 'tnnhisgrievance@vidalhealth.com'
          },
          {
            type: 'text',
            text: 'and '
          },
          {
            type: 'mail',
            address: '010600@uiic.co.in'
          }
        ]
      }
    ]
  }
] as PageSection[];

/** Explicit form action: replace the known English beneficiary sections, preserve other sections and Tamil. */
export function updateGrievanceBeneficiaries(values: AdminPageValues): AdminPageValues {
  const result = structuredClone(values);
  if (!result.en) return result;
  const known = new Set(['mdindia-tpa', 'hitpa-tpa', 'medi-assist-tpa', 'vidal-health-tpa']);
  const isBeneficiary = (section: PageSection) => known.has(section.id) || (section.id === 's3' && /vidal/i.test(section.heading ?? ''));
  const sections = result.en.sections;
  const start = sections.findIndex(isBeneficiary);
  const retained = sections.filter(section => !isBeneficiary(section));
  retained.splice(start < 0 ? 0 : Math.min(start, retained.length), 0, ...structuredClone(CURRENT_GRIEVANCE_BENEFICIARIES));
  result.en.sections = retained;
  return result;
}

/** Supplied NHIS 2026 details from f0b98e7. Used only when an administrator explicitly adds them. */
export const DEFAULT_GRIEVANCE_SECTIONS: Record<Locale, PageSection[]> = {
  "en": [
    {
      "id": "nodal-2026",
      "key": "nodal-2026",
      "heading": "Nodal Officer for NHIS 2026 Implementation",
      "blocks": [
        {
          "type": "table",
          "headers": [
            "No.",
            "Name",
            "Designation",
            "Contact number",
            "E-mail"
          ],
          "rows": [
            [
              [
                {
                  "type": "text",
                  "text": "1"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Mr. V S Rajasubramaniam"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Chief Business Manager"
                }
              ],
              [
                {
                  "type": "phone",
                  "number": "9789055837",
                  "text": "9789055837"
                }
              ],
              [
                {
                  "type": "mail",
                  "address": "rajasubramanianvs@uiic.co.in"
                }
              ]
            ],
            [
              [
                {
                  "type": "text",
                  "text": "2"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Mr. G Ravikiran"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Manager"
                }
              ],
              [
                {
                  "type": "phone",
                  "number": "9600191013",
                  "text": "9600191013"
                }
              ],
              [
                {
                  "type": "mail",
                  "address": "ravikirang@uiic.co.in"
                }
              ]
            ]
          ]
        }
      ]
    },
    {
      "id": "escalation-1",
      "key": "escalation-1",
      "heading": "Escalation Matrix 1",
      "blocks": [
        {
          "type": "table",
          "headers": [
            "No.",
            "Name",
            "Designation",
            "Contact number",
            "E-mail"
          ],
          "rows": [
            [
              [
                {
                  "type": "text",
                  "text": "1"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Mr. P. Suganesh"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Regional Manager"
                }
              ],
              [
                {
                  "type": "phone",
                  "number": "9789909967",
                  "text": "9789909967"
                }
              ],
              [
                {
                  "type": "mail",
                  "address": "psuganesh@uiic.co.in"
                }
              ]
            ]
          ]
        }
      ]
    },
    {
      "id": "escalation-2",
      "key": "escalation-2",
      "heading": "Escalation Matrix 2",
      "blocks": [
        {
          "type": "table",
          "headers": [
            "No.",
            "Name",
            "Designation",
            "Contact number",
            "E-mail"
          ],
          "rows": [
            [
              [
                {
                  "type": "text",
                  "text": "1"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Mr. V N Sandeep"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Deputy General Manager"
                }
              ],
              [
                {
                  "type": "phone",
                  "number": "9489456079",
                  "text": "9489456079"
                }
              ],
              [
                {
                  "type": "mail",
                  "address": "vnsandeep@uiic.co.in"
                }
              ]
            ]
          ]
        }
      ]
    }
  ],
  "ta": [
    {
      "id": "nodal-2026",
      "key": "nodal-2026",
      "heading": "NHIS 2026 செயல்படுத்தலுக்கான நோடல் அலுவலர்",
      "blocks": [
        {
          "type": "table",
          "headers": [
            "எண்",
            "பெயர்",
            "பதவி",
            "தொடர்பு எண்",
            "மின்னஞ்சல்"
          ],
          "rows": [
            [
              [
                {
                  "type": "text",
                  "text": "1"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Mr. V S Rajasubramaniam"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Chief Business Manager"
                }
              ],
              [
                {
                  "type": "phone",
                  "number": "9789055837",
                  "text": "9789055837"
                }
              ],
              [
                {
                  "type": "mail",
                  "address": "rajasubramanianvs@uiic.co.in"
                }
              ]
            ],
            [
              [
                {
                  "type": "text",
                  "text": "2"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Mr. G Ravikiran"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Manager"
                }
              ],
              [
                {
                  "type": "phone",
                  "number": "9600191013",
                  "text": "9600191013"
                }
              ],
              [
                {
                  "type": "mail",
                  "address": "ravikirang@uiic.co.in"
                }
              ]
            ]
          ]
        }
      ]
    },
    {
      "id": "escalation-1",
      "key": "escalation-1",
      "heading": "மேல்முறையீட்டு நிலை 1",
      "blocks": [
        {
          "type": "table",
          "headers": [
            "எண்",
            "பெயர்",
            "பதவி",
            "தொடர்பு எண்",
            "மின்னஞ்சல்"
          ],
          "rows": [
            [
              [
                {
                  "type": "text",
                  "text": "1"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Mr. P. Suganesh"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Regional Manager"
                }
              ],
              [
                {
                  "type": "phone",
                  "number": "9789909967",
                  "text": "9789909967"
                }
              ],
              [
                {
                  "type": "mail",
                  "address": "psuganesh@uiic.co.in"
                }
              ]
            ]
          ]
        }
      ]
    },
    {
      "id": "escalation-2",
      "key": "escalation-2",
      "heading": "மேல்முறையீட்டு நிலை 2",
      "blocks": [
        {
          "type": "table",
          "headers": [
            "எண்",
            "பெயர்",
            "பதவி",
            "தொடர்பு எண்",
            "மின்னஞ்சல்"
          ],
          "rows": [
            [
              [
                {
                  "type": "text",
                  "text": "1"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Mr. V N Sandeep"
                }
              ],
              [
                {
                  "type": "text",
                  "text": "Deputy General Manager"
                }
              ],
              [
                {
                  "type": "phone",
                  "number": "9489456079",
                  "text": "9489456079"
                }
              ],
              [
                {
                  "type": "mail",
                  "address": "vnsandeep@uiic.co.in"
                }
              ]
            ]
          ]
        }
      ]
    }
  ]
};

export function missingGrievanceSections(values: AdminPageValues): number {
  return (['en','ta'] as const).reduce((count, locale) => count + (values[locale] ? DEFAULT_GRIEVANCE_SECTIONS[locale].filter(section => !values[locale]!.sections.some(current => current.id === section.id)).length : 0), 0);
}

/** Append absent sections to the current form; never replace existing sections or recreate a removed translation. */
export function appendGrievanceSections(values: AdminPageValues): AdminPageValues {
  const result = structuredClone(values);
  for (const locale of ['en','ta'] as const) {
    const content = result[locale];
    if (!content) continue;
    for (const section of DEFAULT_GRIEVANCE_SECTIONS[locale]) {
      if (!content.sections.some(current => current.id === section.id)) content.sections.push(structuredClone(section));
    }
  }
  return result;
}
