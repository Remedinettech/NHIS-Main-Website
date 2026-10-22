import { SITE_CONTENT_LIMITS, type FooterLinkGroup, type FooterLogo, type LinkItem } from '@nhis/shared-types';
import { Card } from '../../components/common/Card';
import { BilingualInput } from '../../components/site/BilingualInput';
import { ImageField } from '../../components/site/ImageField';
import { LinkItemEditor } from '../../components/site/LinkItemEditor';
import { ReorderableList } from '../../components/site/ReorderableList';
import { OptionalUrlField } from '../../components/site/OptionalUrlField';
import { SiteContentEditor, type SiteEditorContext } from '../../components/site/SiteContentEditor';
import { SiteTextField } from '../../components/site/SiteTextField';
import { VisibilityToggle } from '../../components/site/VisibilityToggle';
import { emptySiteImage, makeSiteId } from '../../components/site/siteForm';
import { telLinkPreview } from '../../utils/siteContentLinks';

const L = SITE_CONTENT_LIMITS;
const emptyText = () => ({ en: '', ta: '' });

type FooterFormProps = Pick<SiteEditorContext<'footer'>, 'values' | 'setField'>;

/** The cards of the footer editor: wordmark, logos, about text, link groups, helplines, contact block and copyright. */
export function FooterForm({ values, setField }: FooterFormProps) {
  return (
    <>
      <Card title="Website name in the footer" description="The TN-NHIS name at the top of the footer. Its title and subtitle come from Header & helplines.">
        <VisibilityToggle label="Show the wordmark" checked={values.showWordmark} onChange={(next) => setField('showWordmark', next)} />
      </Card>

      <Card title="Footer logos" description="Logos of the organisations behind the scheme. They keep their proportions and are never cropped.">
        <ReorderableList<FooterLogo>
          label="Logos" itemNoun="logo" path="logos" items={values.logos} max={L.footerLogos} collapsible
          onChange={(next) => setField('logos', next)} getId={(item) => item.id} addLabel="Add logo" emptyText="No logos. The footer shows none."
          createItem={() => ({ id: makeSiteId('logo', values.logos.map((item) => item.id)), image: emptySiteImage(), url: null, visible: true })}
          rowTitle={(item) => item.image.alt.en}
          isVisible={(item) => item.visible} setVisible={(item, visible) => ({ ...item, visible })}
          renderItem={(item, row) => (
            <>
              <ImageField
                label="Logo" path={`${row.path}.image`} value={item.image}
                onChange={(image) => { if (image) row.update((current) => ({ ...current, image })); }}
              />
              <OptionalUrlField
                path={`${row.path}.url`} value={item.url} onChange={(url) => row.update((current) => ({ ...current, url }))}
                hint="Where the logo leads when it is clicked. Must start with https://. Leave empty for no link."
              />
            </>
          )}
        />
      </Card>

      <Card title="About" description="The heading and description at the left of the footer.">
        <div className="editor-section">
          <BilingualInput label="Heading" path="about.heading" required limit={L.heading} value={values.about.heading} onChange={(heading) => setField('about', { ...values.about, heading })} />
          <BilingualInput label="Description" path="about.text" required multiline rows={5} limit={L.longText} value={values.about.text} onChange={(text) => setField('about', { ...values.about, text })} />
        </div>
      </Card>

      <Card title="Link groups" description="Columns of links in the footer, for example quick links and portals.">
        <ReorderableList<FooterLinkGroup>
          label="Groups" itemNoun="group" path="linkGroups" items={values.linkGroups} max={L.footerGroups} collapsible
          onChange={(next) => setField('linkGroups', next)} getId={(item) => item.id} addLabel="Add group"
          createItem={() => ({ id: makeSiteId('group', values.linkGroups.map((item) => item.id)), heading: emptyText(), links: [], visible: true })}
          rowTitle={(item) => item.heading.en}
          isVisible={(item) => item.visible} setVisible={(item, visible) => ({ ...item, visible })}
          renderItem={(group, row) => (
            <>
              <BilingualInput
                label="Group heading" path={`${row.path}.heading`} required limit={L.heading} value={group.heading}
                onChange={(heading) => row.update((current) => ({ ...current, heading }))}
              />
              <ReorderableList<LinkItem>
                label={`Links in ${group.heading.en || `group ${row.index + 1}`}`} itemNoun="link" path={`${row.path}.links`} items={group.links} max={L.footerLinks} collapsible
                onChange={(links) => row.update((current) => ({ ...current, links }))} getId={(item) => item.id} addLabel="Add link"
                createItem={() => ({
                  id: makeSiteId('link', group.links.map((item) => item.id)), label: emptyText(), target: { type: 'route', path: '' }, visible: true,
                })}
                rowTitle={(item) => item.label.en}
                isVisible={(item) => item.visible} setVisible={(item, visible) => ({ ...item, visible })}
                renderItem={(link, linkRow) => <LinkItemEditor path={linkRow.path} value={link} onChange={(next) => linkRow.update(next)} />}
              />
            </>
          )}
        />
      </Card>

      <Card title="Helplines" description="Lists the helplines of the Header in the footer.">
        <div className="editor-section">
          <VisibilityToggle label="Show the helplines" checked={values.helplines.visible} onChange={(visible) => setField('helplines', { ...values.helplines, visible })} />
          <BilingualInput
            label="Heading" path="helplines.heading" required limit={L.heading} value={values.helplines.heading}
            onChange={(heading) => setField('helplines', { ...values.helplines, heading })}
          />
        </div>
      </Card>

      <Card title="Project-office address & contacts" description="The office address with its GST details, e-mail and phone shown in the footer of every page. The Contact page does not repeat the address. Use the switch to show or hide this information.">
        <div className="editor-section">
          <VisibilityToggle label="Show the contact block" checked={values.contact.visible} onChange={(visible) => setField('contact', { ...values.contact, visible })} />
          <BilingualInput
            label="Heading" path="contact.heading" required limit={L.heading} value={values.contact.heading}
            onChange={(heading) => setField('contact', { ...values.contact, heading })}
          />
          <BilingualInput
            label="Address" path="contact.address" multiline rows={3} limit={L.text} value={values.contact.address}
            onChange={(address) => setField('contact', { ...values.contact, address })} hint="Line breaks are kept."
          />
          <div className="form-grid form-grid--2">
            <SiteTextField
              label="E-mail address" path="contact.email" type="email" inputMode="email" limit={L.email} value={values.contact.email}
              onChange={(email) => setField('contact', { ...values.contact, email })} hint="Optional."
            />
            <SiteTextField
              label="Phone number" path="contact.phone" type="tel" inputMode="tel" limit={L.number} value={values.contact.phone}
              onChange={(phone) => setField('contact', { ...values.contact, phone })}
              hint={telLinkPreview(values.contact.phone) ? `Optional. The call link will be ${telLinkPreview(values.contact.phone)}.` : 'Optional. As shown on the website; the call link is created from it.'}
            />
          </div>
        </div>
      </Card>

      <Card title="Copyright">
        <BilingualInput
          label="Copyright line" path="copyright" required limit={L.text} value={values.copyright} onChange={(next) => setField('copyright', next)}
          hint={<>Write <span className="ff__code">{'{year}'}</span> where the current year belongs: it is replaced automatically on the website.</>}
        />
      </Card>
    </>
  );
}

/** Editor of the footer document. */
export default function FooterPage() {
  return (
    <SiteContentEditor contentKey="footer">
      {({ values, setField }) => <FooterForm values={values} setField={setField} />}
    </SiteContentEditor>
  );
}
