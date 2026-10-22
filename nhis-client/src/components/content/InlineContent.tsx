import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { isSafeHttpsUrl, type InlineNode } from '@nhis/shared-types';
import { mailtoHref, telHref } from '../../utils/safeUrl';
import { isSitePath } from '../../utils/urls';
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
            if (isSitePath(node.href)) return <Link key={index} to={node.href}>{node.text}</Link>;
            // Another site is only linked by an https address (the content rules say the same); anything else is plain text.
            return isSafeHttpsUrl(node.href)
              ? <ExternalLink key={index} href={node.href}>{node.text}</ExternalLink>
              : <Fragment key={index}>{node.text}</Fragment>;
          }
        }
      })}
    </>
  );
}
