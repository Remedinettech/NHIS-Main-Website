import type { OfficerRow } from '../../config/projectOffice';
import { useLanguage } from '../../context/LanguageContext';
import { mailtoHref, telHref } from '../../utils/safeUrl';
import './contacts.css';

interface OfficerTableProps {
  caption: string;
  rows: ReadonlyArray<OfficerRow>;
  /** Show the employee number column (project office officials). */
  empNo?: boolean;
}

/** Static officer table that reuses the contact directory table styling (stacked cards on small screens). */
export function OfficerTable({ caption, rows, empNo = false }: OfficerTableProps) {
  const { t } = useLanguage();
  const showPhone = rows.some((row) => row.phone);
  const showEmail = rows.some((row) => row.email);
  const heading = {
    serial: t('contacts.cols.serial'),
    empNo: t('contacts.cols.empNo'),
    name: t('contacts.cols.name'),
    designation: t('contacts.cols.designation'),
    phone: t('contacts.cols.phone'),
    email: t('contacts.cols.email'),
  };

  return (
    <div className="contact-table-wrap">
      <table className="contact-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{heading.serial}</th>
            {empNo && <th scope="col">{heading.empNo}</th>}
            <th scope="col">{heading.name}</th>
            <th scope="col">{heading.designation}</th>
            {showPhone && <th scope="col">{heading.phone}</th>}
            {showEmail && <th scope="col">{heading.email}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const tel = row.phone ? telHref(row.phone) : null;
            const mail = row.email ? mailtoHref(row.email) : null;
            return (
              <tr key={`${row.empNo ?? row.email ?? row.name}`}>
                <td data-label={heading.serial}>{index + 1}</td>
                {empNo && <td data-label={heading.empNo}>{row.empNo}</td>}
                <td data-label={heading.name}>{row.name}</td>
                <td data-label={heading.designation}>{row.designation}</td>
                {showPhone && <td data-label={heading.phone}>{row.phone ? (tel ? <a href={tel}>{row.phone}</a> : row.phone) : '–'}</td>}
                {showEmail && (
                  <td data-label={heading.email}>
                    {row.email ? (mail ? <a href={mail} className="mail-link">{row.email}</a> : row.email) : '–'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
