import {
  DEFAULT_SITE_CONTENT, HOME_SECTION_LABELS, SITE_CONTENT_LIMITS,
  type DocumentCategory, type HighlightItem, type HomeActionLink, type HomeContent, type HomeSectionSetting, type LinkItem, type PathwayGroup, type PathwayLink, type QuickTile,
} from '@nhis/shared-types';
import { CATEGORY_LABELS } from '../../config/app';
import { Card } from '../../components/common/Card';
import { CheckboxField } from '../../components/common/fields';
import { BilingualInput } from '../../components/site/BilingualInput';
import { ImageField } from '../../components/site/ImageField';
import { LinkItemEditor } from '../../components/site/LinkItemEditor';
import { LinkTargetEditor } from '../../components/site/LinkTargetEditor';
import { ReorderableList } from '../../components/site/ReorderableList';
import { SiteContentEditor, type SiteEditorContext } from '../../components/site/SiteContentEditor';
import { useSiteForm } from '../../components/site/SiteFormContext';
import { SiteSelect } from '../../components/site/SiteSelect';
import { VisibilityToggle } from '../../components/site/VisibilityToggle';
import { useHeaderHelplines } from '../../components/site/useHeaderHelplines';
import { useSiteDocuments } from '../../components/site/useSiteDocuments';
import {
  HOME_DOCUMENT_CATEGORIES, ICON_CHOICES, helplineChoices, isLockedSection, newHighlight, newHomeAction, newLink, newPathwayGroup, newPathwayLink,
  newQuickTile, sectionVisibilityLock, setSectionVisible, toggleCategory,
} from '../../components/site/siteEdit';

const L = SITE_CONTENT_LIMITS;

type HomeFormProps = Pick<SiteEditorContext<'home'>, 'values' | 'setField'>;
type Setter<K extends keyof HomeContent> = (next: HomeContent[K]) => void;

const VARIANTS = [
  { value: 'primary', label: 'Main button (filled)' },
  { value: 'secondary', label: 'Outlined button' },
  { value: 'ghost', label: 'Quiet button (text only)' },
];

/* ------------------------------------------------------------------ sections */

function SectionsCard({ sections, onChange }: { sections: HomeSectionSetting[]; onChange: Setter<'sections'> }) {
  return (
    <Card title="Order of the sections" description="The sections of the homepage from top to bottom. Hide a section to remove it from the page; a hidden section keeps what you wrote.">
      <ReorderableList<HomeSectionSetting>
        label="Sections" itemNoun="section" path="sections" items={sections} fixed onChange={onChange} getId={(section) => section.id}
        rowTitle={(section) => HOME_SECTION_LABELS[section.id]} locked={isLockedSection} visibilityLocked={sectionVisibilityLock}
        isVisible={(section) => section.visible} setVisible={setSectionVisible} renderItem={() => null}
        hint="The main banner section, with the hospital search, always comes first and is always shown."
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ hero */

function HeroCards({ hero, onChange }: { hero: HomeContent['hero']; onChange: Setter<'hero'> }) {
  return (
    <>
      <Card title="Main homepage banner" description="The introduction at the top of the homepage: the scheme name, the coverage statement and the main buttons.">
        <div className="editor-section">
          <BilingualInput label="Line above the title" path="hero.eyebrow" required limit={L.label} value={hero.eyebrow} onChange={(eyebrow) => onChange({ ...hero, eyebrow })} />
          <BilingualInput label="Title" path="hero.title" required limit={L.heading} value={hero.title} onChange={(title) => onChange({ ...hero, title })} />
          <BilingualInput
            label="Short paragraph under the title (optional)" path="hero.description" multiline rows={3} limit={L.text} value={hero.description}
            onChange={(description) => onChange({ ...hero, description })}
          />
          <BilingualInput label="Heading of the coverage statement" path="hero.coverageHeading" required limit={L.heading} value={hero.coverageHeading} onChange={(coverageHeading) => onChange({ ...hero, coverageHeading })} />
          <BilingualInput
            label="Coverage statement" path="hero.coverageStatement" required multiline rows={3} limit={L.longText} value={hero.coverageStatement}
            onChange={(coverageStatement) => onChange({ ...hero, coverageStatement })}
          />
          <ImageField
            label="Banner picture (optional)" path="hero.banner" value={hero.banner} optional onChange={(banner) => onChange({ ...hero, banner })}
            hint="Shown under the buttons. It keeps its proportions and is never cropped."
          />
          <ReorderableList<HomeActionLink>
            label="Buttons under the text" itemNoun="button" path="hero.actions" items={hero.actions} max={L.homeActions} collapsible
            onChange={(actions) => onChange({ ...hero, actions })} getId={(action) => action.id} addLabel="Add button"
            createItem={() => newHomeAction(hero.actions.map((action) => action.id))} emptyText="No buttons. The hero shows only the text."
            rowTitle={(action) => action.label.en} isVisible={(action) => action.visible} setVisible={(action, visible) => ({ ...action, visible })}
            renderItem={(action, row) => (
              <>
                <LinkItemEditor
                  path={row.path} value={action} labelLegend="Button text"
                  onChange={(next) => row.update({ ...action, label: next.label, target: next.target })}
                />
                <SiteSelect label="Look of the button" value={action.variant} options={VARIANTS} onChange={(variant) => row.update((current) => ({ ...current, variant: variant as HomeActionLink['variant'] }))} path={`${row.path}.variant`} />
              </>
            )}
          />
        </div>
      </Card>

      <Card title="Hospital search box" description="The search box next to the hero text. It searches the list of network hospitals.">
        <div className="editor-section">
          <BilingualInput label="Heading" path="hero.search.heading" required limit={L.heading} value={hero.search.heading} onChange={(heading) => onChange({ ...hero, search: { ...hero.search, heading } })} />
          <BilingualInput label="Help text (optional)" path="hero.search.hint" multiline rows={2} limit={L.text} value={hero.search.hint} onChange={(hint) => onChange({ ...hero, search: { ...hero.search, hint } })} />
          <BilingualInput label="Hint inside the empty search box" path="hero.search.placeholder" required limit={L.label} value={hero.search.placeholder} onChange={(placeholder) => onChange({ ...hero, search: { ...hero.search, placeholder } })} />
          <div className="form-grid form-grid--2">
            <BilingualInput label="Search button" path="hero.search.button" required limit={L.label} value={hero.search.button} onChange={(button) => onChange({ ...hero, search: { ...hero.search, button } })} />
            <BilingualInput label="Link to the full hospital list" path="hero.search.browseAll" required limit={L.label} value={hero.search.browseAll} onChange={(browseAll) => onChange({ ...hero, search: { ...hero.search, browseAll } })} />
          </div>
          <VisibilityToggle
            label="Show the number of listed hospitals" checked={hero.search.showCount} onChange={(showCount) => onChange({ ...hero, search: { ...hero.search, showCount } })}
            hint="For example “Search across 1,000 listed hospitals”, under the search box."
          />
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ quick access */

function QuickAccessCard({ quickAccess, onChange }: { quickAccess: HomeContent['quickAccess']; onChange: Setter<'quickAccess'> }) {
  return (
    <Card title="Quick access" description="Tiles that lead to the pages people look for most.">
      <div className="editor-section">
        <BilingualInput label="Heading" path="quickAccess.heading" required limit={L.heading} value={quickAccess.heading} onChange={(heading) => onChange({ ...quickAccess, heading })} />
        <ReorderableList<QuickTile>
          label="Tiles" itemNoun="tile" path="quickAccess.tiles" items={quickAccess.tiles} max={L.quickTiles} collapsible
          onChange={(tiles) => onChange({ ...quickAccess, tiles })} getId={(tile) => tile.id} addLabel="Add tile"
          createItem={() => newQuickTile(quickAccess.tiles.map((tile) => tile.id))} emptyText="No tiles. The quick access section shows nothing."
          rowTitle={(tile) => tile.label.en} isVisible={(tile) => tile.visible} setVisible={(tile, visible) => ({ ...tile, visible })}
          renderItem={(tile, row) => (
            <>
              <BilingualInput label="Tile text" path={`${row.path}.label`} required limit={L.label} value={tile.label} onChange={(label) => row.update((current) => ({ ...current, label }))} />
              <BilingualInput
                label="Small second line (optional)" path={`${row.path}.hint`} limit={L.label} value={tile.hint} onChange={(hint) => row.update((current) => ({ ...current, hint }))}
                hint="For example “NHIS portal” for a tile that leaves this website."
              />
              <SiteSelect label="Icon" value={tile.icon} options={ICON_CHOICES} path={`${row.path}.icon`} onChange={(icon) => row.update((current) => ({ ...current, icon: icon as QuickTile['icon'] }))} />
              <LinkTargetEditor path={`${row.path}.target`} value={tile.target} onChange={(target) => row.update((current) => ({ ...current, target }))} />
            </>
          )}
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ pathways */

/** The helpline a pathway shows under its links. The numbers come from the header document. */
function HelplineChoice({ path, value, onChange }: { path: string; value: string | null; onChange: (next: string | null) => void }) {
  const helplines = useHeaderHelplines();
  const list = helplines.data ?? DEFAULT_SITE_CONTENT.header.helplines;
  return (
    <SiteSelect
      label="Helpline shown under the links" value={value ?? ''} placeholder="No helpline" path={path} options={helplineChoices(list, value)}
      onChange={(next) => onChange(next === '' ? null : next)}
      hint={helplines.error && !helplines.data ? 'The helplines of the Header could not be loaded; the built-in ones are listed. Reload this page to try again.' : 'The numbers are edited under Site content > Header.'}
    />
  );
}

function PathwaysCard({ pathways, onChange }: { pathways: HomeContent['pathways']; onChange: Setter<'pathways'> }) {
  return (
    <Card title="Pathways" description="Columns of links for each kind of visitor, for example employees and pensioners.">
      <div className="editor-section">
        <BilingualInput label="Heading" path="pathways.heading" required limit={L.heading} value={pathways.heading} onChange={(heading) => onChange({ ...pathways, heading })} />
        <ReorderableList<PathwayGroup>
          label="Pathways" itemNoun="pathway" path="pathways.groups" items={pathways.groups} max={L.pathwayGroups} collapsible
          onChange={(groups) => onChange({ ...pathways, groups })} getId={(group) => group.id} addLabel="Add pathway"
          createItem={() => newPathwayGroup(pathways.groups.map((group) => group.id))} emptyText="No pathways."
          rowTitle={(group) => group.heading.en} isVisible={(group) => group.visible} setVisible={(group, visible) => ({ ...group, visible })}
          renderItem={(group, row) => (
            <>
              <BilingualInput label="Heading of the pathway" path={`${row.path}.heading`} required limit={L.heading} value={group.heading} onChange={(heading) => row.update((current) => ({ ...current, heading }))} />
              <HelplineChoice path={`${row.path}.helplineId`} value={group.helplineId} onChange={(helplineId) => row.update((current) => ({ ...current, helplineId }))} />
              <ReorderableList<PathwayLink>
                label={`Links in ${group.heading.en.trim() || `pathway ${row.index + 1}`}`} itemNoun="link" path={`${row.path}.links`} items={group.links} max={L.pathwayLinks} collapsible
                onChange={(links) => row.update((current) => ({ ...current, links }))} getId={(link) => link.id} addLabel="Add link"
                createItem={() => newPathwayLink(group.links.map((link) => link.id))} emptyText="No links in this pathway."
                rowTitle={(link) => link.label.en} isVisible={(link) => link.visible} setVisible={(link, visible) => ({ ...link, visible })}
                hint={<>For a document link you can write <span className="ff__code">{'{title}'}</span> in the text: the website replaces it with the title of the document.</>}
                renderItem={(link, linkRow) => (
                  <>
                    <LinkItemEditor
                      path={linkRow.path} value={link} labelLegend="Link text"
                      onChange={(next) => linkRow.update({ ...link, label: next.label, target: next.target })}
                    />
                    <SiteSelect label="Icon" value={link.icon} options={ICON_CHOICES} path={`${linkRow.path}.icon`} onChange={(icon) => linkRow.update((current) => ({ ...current, icon: icon as PathwayLink['icon'] }))} />
                  </>
                )}
              />
            </>
          )}
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ documents */

/** The documents to list by name. A new row starts with the first document that is not in the list yet, so a row is never empty. */
function DocumentIdsList({ ids, onChange }: { ids: string[]; onChange: (next: string[]) => void }) {
  const documents = useSiteDocuments();
  const options = documents.data ?? [];
  const free = options.find((option) => !ids.includes(option.value));
  const loading = documents.loading && !documents.data;
  const failed = documents.error !== undefined && !documents.data;
  const blocked = loading ? 'Loading documents…' : failed ? 'The documents could not be loaded. Reload this page to try again.' : free ? null : 'Every document is already in the list.';
  const nameOf = (id: string) => options.find((option) => option.value === id)?.label ?? (documents.data ? `Unknown document (${id})` : id);
  return (
    <ReorderableList<string>
      label="Documents to show, by name" itemNoun="document" path="documents.documentIds" items={ids} max={L.documentIds}
      onChange={onChange} getId={(id) => id} addLabel="Add document" createItem={() => free?.value ?? ''} addBlocked={blocked}
      hint="When this list has documents, only these are shown, in this order. Leave it empty to show every published document of the categories below."
      emptyText="No documents chosen. The website lists the published documents of the chosen categories."
      rowTitle={nameOf}
      renderItem={(id, row) => (
        <SiteSelect
          label="Document" required value={id} path={row.path} disabled={row.disabled}
          options={[
            ...(documents.data && !options.some((option) => option.value === id) ? [{ value: id, label: `Unknown document (${id})` }] : []),
            ...options.filter((option) => option.value === id || !ids.includes(option.value)),
          ]}
          onChange={(next) => row.update(next)}
          hint={options.find((option) => option.value === id)?.published === false ? 'This document is not published yet, so the website does not show it.' : undefined}
        />
      )}
    />
  );
}

function CategoryChoices({ selected, onChange }: { selected: DocumentCategory[]; onChange: (next: DocumentCategory[]) => void }) {
  const { errors, readOnly } = useSiteForm();
  const error = errors['documents.categories'] ?? Object.entries(errors).find(([path]) => path.startsWith('documents.categories.'))?.[1];
  return (
    <fieldset className="bilingual" disabled={readOnly}>
      <legend className="bilingual__legend">Categories listed when no document is chosen by name</legend>
      <p className="ff__hint">The website lists every published document of these categories.</p>
      {error && <p className="ff__error" role="alert">{error}</p>}
      <div className="stack">
        {HOME_DOCUMENT_CATEGORIES.map((category) => (
          <CheckboxField key={category} label={CATEGORY_LABELS[category]} checked={selected.includes(category)} onChange={(on) => onChange(toggleCategory(selected, category, on))} />
        ))}
      </div>
    </fieldset>
  );
}

function DocumentsCard({ documents, onChange }: { documents: HomeContent['documents']; onChange: Setter<'documents'> }) {
  return (
    <Card title="Documents and forms" description="A list of documents from the Documents section, with links to the full lists.">
      <div className="editor-section">
        <BilingualInput label="Heading" path="documents.heading" required limit={L.heading} value={documents.heading} onChange={(heading) => onChange({ ...documents, heading })} />
        <BilingualInput label="Introduction (optional)" path="documents.intro" multiline rows={2} limit={L.text} value={documents.intro} onChange={(intro) => onChange({ ...documents, intro })} />
        <DocumentIdsList ids={documents.documentIds} onChange={(documentIds) => onChange({ ...documents, documentIds })} />
        <CategoryChoices selected={documents.categories} onChange={(categories) => onChange({ ...documents, categories })} />
        <ReorderableList<LinkItem>
          label="Links under the list" itemNoun="link" path="documents.links" items={documents.links} max={L.footerLinks} collapsible
          onChange={(links) => onChange({ ...documents, links })} getId={(link) => link.id} addLabel="Add link"
          createItem={() => newLink(documents.links.map((link) => link.id))} emptyText="No links."
          rowTitle={(link) => link.label.en} isVisible={(link) => link.visible} setVisible={(link, visible) => ({ ...link, visible })}
          renderItem={(link, row) => <LinkItemEditor path={row.path} value={link} labelLegend="Link text" onChange={(next) => row.update({ ...link, label: next.label, target: next.target })} />}
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ panels and highlights */

function PanelCards({ home, setField }: { home: HomeContent; setField: HomeFormProps['setField'] }) {
  const { coverage, helplines } = home;
  return (
    <>
      <Card title="Coverage panel" description="The panel that leads to the coverage page. Its text is the page Coverage, edited under Pages.">
        <div className="editor-section">
          <BilingualInput label="Heading" path="coverage.heading" required limit={L.heading} value={coverage.heading} onChange={(heading) => setField('coverage', { ...coverage, heading })} />
          <BilingualInput label="Text of the link" path="coverage.linkLabel" required limit={L.label} value={coverage.linkLabel} onChange={(linkLabel) => setField('coverage', { ...coverage, linkLabel })} />
        </div>
      </Card>
      <Card title="Help and support panel" description="The panel with the helpline numbers. The numbers are edited under Site content > Header.">
        <div className="editor-section">
          <BilingualInput label="Heading" path="helplines.heading" required limit={L.heading} value={helplines.heading} onChange={(heading) => setField('helplines', { ...helplines, heading })} />
          <BilingualInput label="Introduction (optional)" path="helplines.intro" multiline rows={2} limit={L.text} value={helplines.intro} onChange={(intro) => setField('helplines', { ...helplines, intro })} />
        </div>
      </Card>
    </>
  );
}

function HighlightsCard({ highlights, onChange }: { highlights: HomeContent['highlights']; onChange: Setter<'highlights'> }) {
  return (
    <Card title="Scheme highlights" description="Figures and periods worth knowing, for example the cover amount. Nothing is shown while the list is empty.">
      <div className="editor-section">
        <BilingualInput label="Heading" path="highlights.heading" required limit={L.heading} value={highlights.heading} onChange={(heading) => onChange({ ...highlights, heading })} />
        <BilingualInput label="Introduction (optional)" path="highlights.intro" multiline rows={2} limit={L.text} value={highlights.intro} onChange={(intro) => onChange({ ...highlights, intro })} />
        <ReorderableList<HighlightItem>
          label="Highlights" itemNoun="highlight" path="highlights.items" items={highlights.items} max={L.highlights} collapsible
          onChange={(items) => onChange({ ...highlights, items })} getId={(item) => item.id} addLabel="Add highlight"
          createItem={() => newHighlight(highlights.items.map((item) => item.id))} emptyText="No highlights yet."
          rowTitle={(item) => `${item.value.en} ${item.label.en}`} isVisible={(item) => item.visible} setVisible={(item, visible) => ({ ...item, visible })}
          renderItem={(item, row) => (
            <>
              <BilingualInput
                label="Figure or period" path={`${row.path}.value`} required limit={L.label} value={item.value} onChange={(value) => row.update((current) => ({ ...current, value }))}
                hint="For example “₹5,00,000” or “1 year”."
              />
              <BilingualInput label="What it is" path={`${row.path}.label`} required limit={L.label} value={item.label} onChange={(label) => row.update((current) => ({ ...current, label }))} />
              <BilingualInput label="Note (optional)" path={`${row.path}.note`} multiline rows={2} limit={L.text} value={item.note} onChange={(note) => row.update((current) => ({ ...current, note }))} />
            </>
          )}
        />
      </div>
    </Card>
  );
}

/** The cards of the homepage editor, in the order of the page. */
export function HomeForm({ values, setField }: HomeFormProps) {
  return (
    <>
      <SectionsCard sections={values.sections} onChange={(sections) => setField('sections', sections)} />
      <HeroCards hero={values.hero} onChange={(hero) => setField('hero', hero)} />
      <QuickAccessCard quickAccess={values.quickAccess} onChange={(quickAccess) => setField('quickAccess', quickAccess)} />
      <PathwaysCard pathways={values.pathways} onChange={(pathways) => setField('pathways', pathways)} />
      <DocumentsCard documents={values.documents} onChange={(documents) => setField('documents', documents)} />
      <PanelCards home={values} setField={setField} />
      <HighlightsCard highlights={values.highlights} onChange={(highlights) => setField('highlights', highlights)} />
    </>
  );
}

/** Editor of the homepage document. */
export default function HomeEditPage() {
  return (
    <SiteContentEditor contentKey="home">
      {({ values, setField }) => <HomeForm values={values} setField={setField} />}
    </SiteContentEditor>
  );
}
