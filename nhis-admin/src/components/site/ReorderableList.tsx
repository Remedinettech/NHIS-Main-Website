import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../utils/classNames';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { useSiteForm } from './SiteFormContext';
import { VisibilityToggle } from './VisibilityToggle';
import { describeAddition, describeMove, describeRemoval, hasErrorUnder, moveItem, pluralise, removeItem, type FieldErrors } from './siteForm';
import './site.css';

/** What `renderItem` gets for the row it draws. */
export interface RowContext<T> {
  index: number;
  /** Path of this row in the document ("helplines.2"), the prefix of the paths of its fields. */
  path: string;
  /** Replaces this row. Takes the new value or a function of the current one. */
  update: (next: T | ((current: T) => T)) => void;
  /** The list is read-only (no permission to edit). */
  disabled: boolean;
}

/** One "Add ..." button. A list with several kinds of rows (a link or a dropdown) has one button per kind. */
export interface AddOption<T> {
  label: string;
  create: () => T;
}

export interface ReorderableListProps<T> {
  /** Name of the list, shown as its legend ("Helplines"). */
  label: string;
  /** Singular noun in lower case, used in button names and announcements ("helpline"). */
  itemNoun: string;
  /** Plural of `itemNoun` when it is not the usual one. Default: "entry" -> "entries", "group" -> "groups". */
  itemNounPlural?: string;
  /** Path of the list in the document ("helplines"). Errors in the list or beneath it are read from here. */
  path: string;
  items: readonly T[];
  onChange: (next: T[]) => void;
  /** Stable id of an item: the React key and the focus target after moves. Use the item's own `id` (see makeSiteId). */
  getId: (item: T) => string;
  /** A new, empty item for "Add". Give it an id that is unique in the document (makeSiteId). */
  createItem?: () => T;
  /** Several "Add" buttons instead of `createItem` (one per kind of row). */
  addOptions?: ReadonlyArray<AddOption<T>>;
  /** The editing controls of one row. Return null for a row that has nothing to edit. */
  renderItem: (item: T, row: RowContext<T>) => ReactNode;
  /** Heading of a row. Default "Helpline 2". */
  rowTitle?: (item: T, index: number) => string;
  /** Maximum number of rows (SITE_CONTENT_LIMITS). "Add" is disabled when it is reached. */
  max?: number;
  /** Minimum number of rows; "Remove" is disabled at it. Default 0. */
  min?: number;
  /** A locked row cannot be moved and no row can be moved onto its place (the homepage hero while it is first). */
  locked?: (item: T, index: number) => boolean;
  /** Rows can only be moved and shown or hidden; they cannot be added or removed (the homepage sections). */
  fixed?: boolean;
  /** With `setVisible`: adds a "Shown on the website" switch to every row; hidden rows get a "Hidden" badge. */
  isVisible?: (item: T) => boolean;
  setVisible?: (item: T, visible: boolean) => T;
  /** A reason why the row's switch cannot be changed ("The hero section cannot be hidden."), or null. */
  visibilityLocked?: (item: T, index: number) => string | null;
  /** A reason why the row cannot be removed ("2 partners are in this group."), or null. */
  removeBlocked?: (item: T, index: number) => string | null;
  /** A reason why nothing can be added right now ("No document left to add."), or null. */
  addBlocked?: string | null;
  /** Extra text under the row heading (for example a warning that the row is hidden on the website). */
  rowNote?: (item: T, index: number) => ReactNode;
  /** A short tag next to the row heading ("Dropdown", "Heading"), for lists that mix kinds of rows. */
  rowTag?: (item: T, index: number) => string | undefined;
  /**
   * Path of a row in the document when it is not `${path}.${index}`: a list that shows only some rows of a longer list
   * (the partners of one group) maps its rows to their place in the whole list so that errors are found.
   */
  rowPath?: (item: T, index: number) => string;
  /** Do not show the error of the list itself (a page with several lists of the same document shows it once). */
  hideListError?: boolean;
  /** Rows can be collapsed to their heading (for long lists). Rows with errors are always open. */
  collapsible?: boolean;
  /** With `collapsible`: rows start collapsed (new rows start open). */
  startCollapsed?: boolean;
  hint?: ReactNode;
  emptyText?: string;
  /** Text of the add button. Default "Add helpline". */
  addLabel?: string;
  disabled?: boolean;
  /** Overrides the errors of the surrounding SiteContentEditor. */
  errors?: FieldErrors;
}

type FocusTarget = 'up' | 'down' | 'first-control' | 'head';
interface FocusRequest { /** Id of the row; '' = the add button. */ id: string; target: FocusTarget }

const capitalise = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
/** The first control to focus in a new row. The hidden file input of an image field is skipped: its button comes next. */
const FIRST_CONTROL = ':scope > .reorder__body :is(input:not([type="hidden"]):not([type="file"]), textarea, select, button):not(:disabled)';
/** Where focus goes when a neighbouring row was removed: its first control that can take focus (the switch, the toggle or a button). */
const ROW_HEAD_CONTROL = ':scope > .reorder__head :is(button, input):not(:disabled):not([type="file"])';

/**
 * Ordered rows with Move up / Move down / Remove buttons (disabled at the ends), an Add button, an optional show/hide
 * switch and collapsible bodies. Everything is keyboard operable and every button names its row ("Move up helpline 2").
 * Moves, additions and removals are announced in a polite live region, and focus stays on the control the user just
 * pressed (or moves to the new row / the next row). Rows are keyed by `getId`, so their state survives a move.
 */
export function ReorderableList<T>({
  label, itemNoun, itemNounPlural, path, items, onChange, getId, createItem, addOptions, renderItem, rowTitle, max, min = 0, isVisible, setVisible,
  visibilityLocked, removeBlocked, addBlocked, rowNote, rowTag, rowPath: pathOf, hideListError, collapsible, startCollapsed, hint, emptyText, addLabel, disabled, errors, locked, fixed,
}: ReorderableListProps<T>) {
  const form = useSiteForm();
  const errs = errors ?? form.errors;
  const off = disabled || form.readOnly;
  const baseId = useId();
  const plural = itemNounPlural ?? pluralise(itemNoun);
  const [announcement, setAnnouncement] = useState('');
  // The user's choice per row. Without one a row is open, or closed with `startCollapsed`. New rows are opened.
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(new Map());
  const pendingFocus = useRef<FocusRequest | null>(null);
  const rowElements = useRef(new Map<string, HTMLLIElement>());
  const addButton = useRef<HTMLButtonElement>(null);

  // Runs after every render; only acts when a move, addition or removal asked for focus.
  useLayoutEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;
    pendingFocus.current = null;
    if (request.id === '') {
      addButton.current?.focus();
      return;
    }
    const row = rowElements.current.get(request.id);
    if (!row) return;
    if (request.target === 'up' || request.target === 'down') {
      const same = row.querySelector<HTMLElement>(`:scope > .reorder__head [data-action="${request.target}"]:not(:disabled)`);
      const other = row.querySelector<HTMLElement>(':scope > .reorder__head [data-action="up"]:not(:disabled), :scope > .reorder__head [data-action="down"]:not(:disabled)');
      (same ?? other ?? row.querySelector<HTMLElement>(ROW_HEAD_CONTROL))?.focus();
      return;
    }
    const first = request.target === 'first-control' ? row.querySelector<HTMLElement>(FIRST_CONTROL) : null;
    (first ?? row.querySelector<HTMLElement>(ROW_HEAD_CONTROL))?.focus();
  });

  const customTitle = (item: T, index: number): string | undefined => rowTitle?.(item, index).trim() || undefined;
  const titleOf = (item: T, index: number): string => customTitle(item, index) ?? `${capitalise(itemNoun)} ${index + 1}`;
  const announce = (text: string) => setAnnouncement(text);
  const atMax = max !== undefined && items.length >= max;
  const creators: ReadonlyArray<AddOption<T>> = addOptions ?? (createItem ? [{ label: addLabel ?? `Add ${itemNoun}`, create: createItem }] : []);
  /** Whether the row at `index` may move to `to`: neither it nor the row it would displace may be locked. */
  const canMove = (index: number, to: number): boolean => (
    to >= 0 && to < items.length && !locked?.(items[index] as T, index) && !locked?.(items[to] as T, to)
  );

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (!canMove(index, to)) return;
    const item = items[index] as T;
    pendingFocus.current = { id: getId(item), target: delta < 0 ? 'up' : 'down' };
    onChange(moveItem(items, index, to));
    announce(describeMove(itemNoun, index, to, items.length, customTitle(item, index)));
  };

  const remove = (index: number) => {
    if (fixed) return;
    const removed = items[index] as T;
    const neighbour = items[index + 1] ?? items[index - 1];
    pendingFocus.current = { id: neighbour ? getId(neighbour) : '', target: 'head' };
    onChange(removeItem(items, index));
    announce(describeRemoval(itemNoun, index, items.length - 1, plural, customTitle(removed, index)));
  };

  const add = (create: () => T) => {
    if (atMax || addBlocked || fixed) return;
    const item = create();
    const id = getId(item);
    pendingFocus.current = { id, target: 'first-control' };
    setChoices((current) => new Map(current).set(id, true));
    onChange([...items, item]);
    announce(describeAddition(itemNoun, items.length + 1, items.length + 1));
  };

  const listError = hideListError ? undefined : errs[path];
  const blockedId = `${baseId}-add-blocked`;

  return (
    <fieldset className="reorder" disabled={off}>
      <legend className="bilingual__legend">{label}</legend>
      {hint && <p className="ff__hint">{hint}</p>}
      {listError && <p className="ff__error" role="alert">{listError}</p>}
      {items.length === 0 ? (
        <p className="reorder__empty">{emptyText ?? `No ${plural} yet.`}</p>
      ) : (
        <ol className="reorder__list">
          {items.map((item, index) => {
            const id = getId(item);
            const rowPath = pathOf ? pathOf(item, index) : `${path}.${index}`;
            const bodyId = `${baseId}-${id}-body`;
            const hasError = hasErrorUnder(errs, rowPath);
            const visible = isVisible ? isVisible(item) : true;
            const title = titleOf(item, index);
            const name = `${itemNoun} ${index + 1}`;
            const update: RowContext<T>['update'] = (next) => {
              const replacement = typeof next === 'function' ? (next as (current: T) => T)(item) : next;
              // A row whose id is its value (a document chosen from a list) gets a new key when that value changes, so the
              // row is drawn again and the control that was just used is gone: keep the keyboard on the new row's first control.
              const replacementId = getId(replacement);
              if (replacementId !== id) pendingFocus.current = { id: replacementId, target: 'first-control' };
              onChange(items.map((entry, i) => (i === index ? replacement : entry)));
            };
            const body = renderItem(item, { index, path: rowPath, update, disabled: off });
            const hasBody = body !== null && body !== undefined && body !== false;
            const open = !hasBody || !collapsible || hasError || (choices.get(id) ?? !startCollapsed);
            // The hidden suffix tells screen-reader users which row a custom title belongs to; the default title already says it.
            const nameHint = title === `${capitalise(itemNoun)} ${index + 1}` ? null : <span className="visually-hidden"> ({name})</span>;
            const visibleLock = visibilityLocked?.(item, index) ?? null;
            const removeLock = removeBlocked?.(item, index) ?? null;
            const note = rowNote?.(item, index);
            const lockId = `${bodyId}-lock`;
            return (
              <li
                key={id} className={cx('reorder__row', !visible && 'is-hidden')} data-row-id={id}
                ref={(element) => { if (element) rowElements.current.set(id, element); else rowElements.current.delete(id); }}
              >
                <div className="reorder__head">
                  <div className="reorder__title">
                    {collapsible && hasBody ? (
                      // A row with a problem stays open (the problem must not be hidden), so its toggle does nothing: say so instead of
                      // leaving a button that looks usable and ignores the click.
                      <button
                        type="button" className="reorder__toggle" aria-expanded={open} aria-controls={open ? bodyId : undefined} aria-disabled={hasError || undefined}
                        onClick={() => { if (!hasError) setChoices((current) => new Map(current).set(id, !open)); }}
                      >
                        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
                        <span>{title}</span>
                        {nameHint}
                        {hasError && <span className="visually-hidden"> (stays open until the problem is fixed)</span>}
                      </button>
                    ) : <span>{title}{nameHint}</span>}
                    {rowTag?.(item, index) && <Badge tone="info">{rowTag(item, index)}</Badge>}
                    {!visible && <Badge>Hidden</Badge>}
                    {hasError && <Badge tone="danger">Needs attention</Badge>}
                  </div>
                  <div className="reorder__tools">
                    {isVisible && setVisible && (
                      <VisibilityToggle
                        checked={visible} subject={name} disabled={off || visibleLock !== null} onChange={(next) => update(setVisible(item, next))}
                        describedBy={visibleLock ? lockId : undefined}
                      />
                    )}
                    <div className="reorder__buttons">
                      <Button size="sm" variant="ghost" data-action="up" disabled={off || !canMove(index, index - 1)} onClick={() => move(index, -1)}>
                        <Icon name="arrowUp" size={16} />Move up<span className="visually-hidden"> {name}</span>
                      </Button>
                      <Button size="sm" variant="ghost" data-action="down" disabled={off || !canMove(index, index + 1)} onClick={() => move(index, 1)}>
                        <Icon name="arrowDown" size={16} />Move down<span className="visually-hidden"> {name}</span>
                      </Button>
                      {!fixed && (
                        <Button
                          size="sm" variant="ghost" data-action="remove" disabled={off || items.length <= min || removeLock !== null}
                          aria-describedby={removeLock ? lockId : undefined} onClick={() => remove(index)}
                        >
                          Remove<span className="visually-hidden"> {name}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                  {(visibleLock || removeLock || note) && (
                    <div className="reorder__note" id={lockId}>
                      {visibleLock && <p>{visibleLock}</p>}
                      {removeLock && <p>{removeLock}</p>}
                      {note}
                    </div>
                  )}
                </div>
                {open && hasBody && <div className="reorder__body" id={bodyId}>{body}</div>}
              </li>
            );
          })}
        </ol>
      )}
      {!fixed && creators.length > 0 && (
        <div className="reorder__foot">
          {creators.map((option, position) => (
            <button
              key={option.label} ref={position === 0 ? addButton : undefined} type="button" className="btn btn--secondary btn--sm"
              disabled={off || atMax || Boolean(addBlocked)} aria-describedby={addBlocked ? blockedId : undefined} onClick={() => add(option.create)}
            >
              <Icon name="plus" size={16} />{option.label}
            </button>
          ))}
          <p className="reorder__count">
            {items.length}{max !== undefined ? ` of ${max}` : ''} {items.length === 1 && max === undefined ? itemNoun : plural}
            {atMax ? '. The limit is reached.' : ''}
          </p>
          {addBlocked && <p className="reorder__count" id={blockedId}>{addBlocked}</p>}
        </div>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </fieldset>
  );
}
