export interface BilingualText { en: string; ta: string }
export interface Hospital {
 id: string; sourceRow: number; name: BilingualText; address: BilingualText;
 district: BilingualText; state: BilingualText; category: string; postcode: string;
 type: string; specialty: string; contact: string; mapUrl: string;
}
export interface HospitalListResponse {
 data: Hospital[]; total: number; page: number; pageSize: number; totalPages: number;
 districts: string[]; source: 'snapshot'; capturedAt: string;
}
export interface ApiError { error: { code: string; message: string } }
