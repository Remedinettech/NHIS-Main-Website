import { SITE_CONTENT_INFO, SITE_CONTENT_KEYS, type AdminSiteContent, type SiteContentKey } from '@nhis/shared-types';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/common/Badge';
import { LinkButton } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Icon } from '../../components/common/Icon';
import { PageHeader } from '../../components/common/PageHeader';
import { ErrorState, LoadingState } from '../../components/common/StateViews';
import { StatusBadge } from '../../components/common/StatusBadge';
import { TableWrap } from '../../components/common/TableWrap';
import { Banner } from '../../components/common/Toast';
import '../../components/site/site.css';
import { PUBLIC_PAGE_MAP, SITE_EDIT_PATHS, editLocationLabel, previewUrlFor } from '../../config/siteContent';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listSiteContent } from '../../services/siteContent.api';

const formatTime = (iso: string): string => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Status chips of one document: "Built-in" until it is saved, then Draft / Published, plus "Unpublished changes". */
function DocumentStatus({ document }: { document: AdminSiteContent | undefined }) {
  if (!document) return <Badge>Not loaded</Badge>;
  if (!document.customised) return <Badge>Website defaults</Badge>;
  return <StatusBadge status={document.meta.status} hasDraft={document.meta.hasDraft} />;
}

function lastChange(document: AdminSiteContent | undefined): string {
  if (!document || !document.customised) return 'Not edited yet. The website shows the built-in content.';
  const who = document.meta.updatedByEmail ? ` by ${document.meta.updatedByEmail}` : '';
  const published = document.meta.status === 'DRAFT' ? ' Not published yet: visitors still see the built-in content.' : '';
  return `Last saved ${formatTime(document.meta.updatedAt)}${who}.${published}`;
}

/** Hub of the Site content section: one card per document and the map of where each public page is edited. */
export default function SiteHubPage() {
  useDocumentTitle('Website content');
  const list = useAsyncData((signal) => listSiteContent(signal), []);
  const byKey = new Map<SiteContentKey, AdminSiteContent>((list.data ?? []).map((document) => [document.key, document]));

  return (
    <div className="page">
      <PageHeader
        title="Website content"
        intro="Edit the header, menu, homepage, partners, footer, office address, page labels and user-manual videos. Use Website pages for policy text and officer tables, and Contact directories for officials. Changes stay private until published."
      />

      {list.loading && !list.data && <LoadingState label="Loading site content…" rows={3} />}
      {list.error && !list.data && <ErrorState error={list.error} title="Site content could not be loaded" onRetry={list.reload} />}
      {list.error && list.data && <Banner tone="warning" title="The list could not be refreshed">Showing the last loaded information.</Banner>}

      {list.data && (
        <section aria-labelledby="documents-h" className="stack">
          <h2 id="documents-h">What you can edit</h2>
          <ul className="hub-grid">
            {SITE_CONTENT_KEYS.map((key) => {
              const document = byKey.get(key);
              const info = SITE_CONTENT_INFO[key];
              return (
                <li key={key}>
                  <article className="hub-card" aria-labelledby={`hub-${key}`}>
                    <h3 id={`hub-${key}`}>{info.label}</h3>
                    <p className="hub-card__desc">{info.description}</p>
                    <p><DocumentStatus document={document} /></p>
                    <p className="hub-card__meta">{lastChange(document)}</p>
                    <div className="hub-card__actions">
                      <LinkButton to={SITE_EDIT_PATHS[key]} size="sm">Edit<span className="visually-hidden"> {info.label}</span></LinkButton>
                      <a className="btn btn--secondary btn--sm" href={previewUrlFor(key)} target="_blank" rel="noopener noreferrer">
                        <Icon name="external" size={16} />Preview<span className="visually-hidden"> {info.label} on the website (opens in a new tab)</span>
                      </a>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Card
        title="Where each public page is edited"
        description="Every page of the public website, what can be changed on it and where. The header, menu and footer appear on every page."
      >
        <TableWrap label="Where each public page is edited">
          <table className="data-table data-table--wide map-table">
            <thead>
              <tr><th scope="col">Page</th><th scope="col">What can be edited</th><th scope="col">Where</th></tr>
            </thead>
            <tbody>
              {PUBLIC_PAGE_MAP.map((entry) => (
                <tr key={entry.page}>
                  <th scope="row">
                    {entry.page}
                    <span className="map-table__route">{entry.route ?? 'Every page'}</span>
                  </th>
                  <td>{entry.edits}</td>
                  <td>
                    <ul>
                      {entry.where.map((place) => <li key={place.to}><Link to={place.to}>{editLocationLabel(place)}</Link></li>)}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
