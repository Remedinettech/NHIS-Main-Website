# Database foundation

Source: nhis-api/prisma/schema.prisma.

| Model | Responsibility |
|---|---|
| AdminUser | Identity-provider subject, role and enabled flag |
| Hospital | Bilingual fields, source row and draft status |
| Page / PageTranslation | Page identity and locale-specific structured sections |
| Contact | Directory category and original column data pending header review |
| Document / MediaAsset | Metadata, source destination and stored file reference |
| Announcement | Bilingual notice with publication state |
| SiteSetting | Site-level configuration |
| ContentRevision | Versioned payload foundation |
| AuditLog | Change audit foundation |

Seed only hospitals in this starter. It inserts 1,221 records on an empty database as DRAFT, with skipDuplicates enabled on repeated runs. The contact, document and page source datasets remain in the reference folder for reviewed import. The active GET API still serves JSON, not these tables.

Keep telephone numbers, PIN codes and source serial values as strings. Do not deduplicate hospitals by name or join the workbook's second sheet positionally. Correct maps/translations only after review. Add migrations as the publishing model is implemented; the initial schema does not itself enforce draft/published revision isolation.
