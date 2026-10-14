import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import type { InlineNode } from '@nhis/shared-types';
import { mailtoHref, safeExternalUrl, telHref } from '../../utils/safeUrl';
import { ExternalLink } from '../common/ExternalLink';
import { DocumentLink } from './DocumentLink';

/** Renders structured inline content as React elements. Source text is never injected as HTML. */
export function InlineContent({ nodes, lang }: { nodes: ReadonlyArray<InlineNode>; lang?: string }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case 'text':
            return <Fragment key={index}>{node.text}</Fragment>;
          case 'strong':
            return <strong key={index}>{node.text}</strong>;
          case 'document':
            return <DocumentLink key={index} documentId={node.documentId} text={node.text} lang={lang} />;
          case 'mail': {
            const href = mailtoHref(node.address);
            return href
              ? <a key={index} href={href} className="mail-link">{node.address}</a>
              : <Fragment key={index}>{node.address}</Fragment>;
          }
          case 'phone': {
            const href = telHref(node.number);
            return href ? <a key={index} href={href}>{node.text}</a> : <Fragment key={index}>{node.text}</Fragment>;
          }
          case 'link': {
            if (node.href.startsWith('/')) return <Link key={index} to={node.href}>{node.text}</Link>;
            const safe = safeExternalUrl(node.href);
            return safe ? <ExternalLink key={index} href={safe}>{node.text}</ExternalLink> : <Fragment key={index}>{node.text}</Fragment>;
          }
        }
      })}
    </>
  );
}
