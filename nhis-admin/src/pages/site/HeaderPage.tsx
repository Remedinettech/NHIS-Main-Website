import { DEFAULT_SITE_CONTENT, SITE_CONTENT_LIMITS, telHrefFor, type HelplineEntry, type LinkItem } from '@nhis/shared-types';
import { Card } from '../../components/common/Card';
import { BilingualInput } from '../../components/site/BilingualInput';
import { ImageField } from '../../components/site/ImageField';
import { LinkItemEditor } from '../../components/site/LinkItemEditor';
import { ReorderableList } from '../../components/site/ReorderableList';
import { SiteContentEditor, type SiteEditorContext } from '../../components/site/SiteContentEditor';
import { SiteTextField } from '../../components/site/SiteTextField';
import { VisibilityToggle } from '../../components/site/VisibilityToggle';
import { makeSiteId } from '../../components/site/siteForm';
import { telLinkPreview } from '../../utils/siteContentLinks';

const L = SITE_CONTENT_LIMITS;
const BUILT_IN = DEFAULT_SITE_CONTENT.header;

const emptyText = () => ({ en: '', ta: '' });

type HeaderFormProps = Pick<SiteEditorContext<'header'>, 'values' | 'setField'>;

/** The cards of the header editor: logos, title, helpline strip and the Login menu. */
export function HeaderForm({ values, setField }: HeaderFormProps) {
  const { loginMenu } = values;
  return (
    <>
      <Card title="Logos and portrait" description="Shown at the left and right of the header. Pictures keep their proportions; they are never cropped or stretched.">
        <div className="editor-section">
          <ImageField
            label="Government emblem" path="emblem" value={values.emblem} builtIn={BUILT_IN.emblem}
            onChange={(next) => { if (next) setField('emblem', next); }}
          />
          <ImageField
            label="Portrait" path="portrait" value={values.portrait} builtIn={BUILT_IN.portrait}
            onChange={(next) => { if (next) setField('portrait', next); }}
          />
          <VisibilityToggle label="Show the portrait in the header" checked={values.showPortrait} onChange={(next) => setField('showPortrait', next)} />
        </div>
      </Card>

      <Card title="Title and subtitle" description="The title is the name of the website (for example TN-NHIS); a hyphen splits it into a dark and a blue part. It is also added to the browser tab title.">
        <div className="editor-section">
          <BilingualInput label="Website title" path="title" required limit={L.heading} value={values.title} onChange={(next) => setField('title', next)} />
          <BilingualInput label="Subtitle" path="subtitle" required limit={L.heading} value={values.subtitle} onChange={(next) => setField('subtitle', next)} hint="The line under the title, normally the name of the scheme." />
        </div>
      </Card>

      <Card title="Helpline strip" description="The strip above the header with the helpline numbers. Numbers become call links on phones.">
        <div className="editor-section">
          <BilingualInput label="Heading of the strip" path="helplineHeading" required limit={L.heading} value={values.helplineHeading} onChange={(next) => setField('helplineHeading', next)} />
          <SiteTextField
            label="Availability" path="availability" limit={L.label} value={values.availability} onChange={(next) => setField('availability', next)}
            hint="For example 24/7. The same text is shown in every language. Leave it empty to hide it."
          />
          <ReorderableList<HelplineEntry>
            label="Helplines" itemNoun="helpline" path="helplines" items={values.helplines} max={L.helplines} collapsible
            onChange={(next) => setField('helplines', next)} getId={(item) => item.id}
            createItem={() => ({ id: makeSiteId('helpline', values.helplines.map((item) => item.id)), label: emptyText(), number: '', visible: true })}
            rowTitle={(item) => item.label.en}
            isVisible={(item) => item.visible} setVisible={(item, visible) => ({ ...item, visible })}
            renderItem={(item, row) => (
              <>
                <BilingualInput
                  label="Label" path={`${row.path}.label`} required limit={L.label} value={item.label}
                  onChange={(label) => row.update((current) => ({ ...current, label }))}
                />
                <SiteTextField
                  label="Number" path={`${row.path}.number`} required limit={L.number} type="tel" inputMode="tel" value={item.number}
                  onChange={(number) => row.update((current) => ({ ...current, number }))}
                  hint={telLinkPreview(item.number)
                    ? <>Shown as typed. The call link will be <span className="ff__code">{telHrefFor(item.number)}</span>.</>
                    : 'As shown on the website, for example 1800-233-5666. The call link is created from it.'}
                />
              </>
            )}
          />
        </div>
      </Card>

      <Card title="Login menu" description="The Login button and the menu it opens. Each entry leads to a web address by default; a page, document, e-mail or phone number is also possible.">
        <div className="editor-section">
          <div className="form-grid form-grid--2">
            <BilingualInput
              label="Button label" path="loginMenu.label" required limit={L.label} value={loginMenu.label}
              onChange={(label) => setField('loginMenu', { ...loginMenu, label })}
            />
            <BilingualInput
              label="Heading inside the menu" path="loginMenu.heading" required limit={L.heading} value={loginMenu.heading}
              onChange={(heading) => setField('loginMenu', { ...loginMenu, heading })}
            />
          </div>
          <ReorderableList<LinkItem>
            label="Menu entries" itemNoun="entry" path="loginMenu.items" items={loginMenu.items} max={L.loginItems} collapsible
            addLabel="Add menu entry" emptyText="No entries yet. The Login menu shows only the forgot-password link."
            onChange={(items) => setField('loginMenu', { ...loginMenu, items })} getId={(item) => item.id}
            createItem={() => ({
              id: makeSiteId('login', [...loginMenu.items.map((item) => item.id), loginMenu.forgotPassword.id]),
              label: emptyText(), target: { type: 'external', url: '' }, visible: true,
            })}
            rowTitle={(item) => item.label.en}
            isVisible={(item) => item.visible} setVisible={(item, visible) => ({ ...item, visible })}
            renderItem={(item, row) => (
              <LinkItemEditor path={row.path} value={item} labelLegend="Entry text" onChange={(next) => row.update(next)} />
            )}
          />
          <div className="stack">
            <h3>Forgot-password link</h3>
            <LinkItemEditor
              path="loginMenu.forgotPassword" value={loginMenu.forgotPassword} labelLegend="Link text" showVisible
              onChange={(forgotPassword) => setField('loginMenu', { ...loginMenu, forgotPassword })}
            />
          </div>
        </div>
      </Card>
    </>
  );
}

/** Editor of the header document. */
export default function HeaderPage() {
  return (
    <SiteContentEditor contentKey="header">
      {({ values, setField }) => <HeaderForm values={values} setField={setField} />}
    </SiteContentEditor>
  );
}
