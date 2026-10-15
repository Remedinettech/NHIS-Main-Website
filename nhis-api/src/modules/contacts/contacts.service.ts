import type { ContactDirectoryId, ContactDirectoryIndexResponse, ContactDirectoryResponse } from '@nhis/shared-types';
import { serverConfig } from '../../config/server';
import { NotFoundError } from '../../common/utils/errors';
import { parseSlugParam } from '../../common/utils/validation';
import { contactRepository, type ContactRepository } from './contacts.repository';

export const CONTACT_DIRECTORY_IDS = ['coordinators', 'uiic-nodal-officers', 'hospital-nodal-officers', 'treasury-offices', 'project-office-officials'] as const satisfies readonly ContactDirectoryId[];
const isDirectoryId = (value: string): value is ContactDirectoryId => (CONTACT_DIRECTORY_IDS as readonly string[]).includes(value);

export function createContactsService(repository: ContactRepository, capturedAt: () => string = () => serverConfig.snapshotDate) {
  async function index(): Promise<ContactDirectoryIndexResponse> {
    const directories = await repository.listDirectories();
    return {
      data: directories.map(({ id, label, total, flags }) => ({ id, label, total, flags })),
      source: 'snapshot',
      capturedAt: capturedAt(),
    };
  }

  /** Malformed id -> ValidationError (400); well-formed but unknown id -> NotFoundError (404). */
  async function getDirectory(rawId: string): Promise<ContactDirectoryResponse> {
    const id = parseSlugParam(rawId, 'directory');
    const directory = isDirectoryId(id) ? await repository.findDirectory(id) : null;
    if (!directory) throw new NotFoundError('Contact directory not found');
    return { data: directory, source: 'snapshot', capturedAt: capturedAt() };
  }

  return { index, getDirectory };
}

export const contactsService = createContactsService(contactRepository);
