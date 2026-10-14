import { Banner } from './Toast';
import { Button } from './Button';

interface ConflictBannerProps {
  /** Loads the latest version (for example the `reload` of useRecord). */
  onReload: () => void;
  busy?: boolean;
  /** Replaces the default sentence, for example for a bulk action. */
  children?: string;
}

/** Shown after a 409 CONFLICT: someone else saved first. Nothing is overwritten until the user reloads. */
export function ConflictBanner({ onReload, busy, children }: ConflictBannerProps) {
  return (
    <Banner
      tone="warning"
      title="This record was changed by someone else"
      action={<Button variant="secondary" size="sm" disabled={busy} onClick={onReload}>Reload latest</Button>}
    >
      {children ?? 'Your changes were not saved. Reload the latest version, then apply your changes again.'}
    </Banner>
  );
}
