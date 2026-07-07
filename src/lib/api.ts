const isBrowser = typeof window !== 'undefined';
export const API_BASE_URL = isBrowser 
  ? '' 
  : (process.env.NEXT_PUBLIC_API_URL || 'https://anime-api-six-psi.vercel.app');

export interface ImageModel {
  url: string;
  width?: number;
  height?: number;
  blurHash?: string;
}

export interface DubModel {
  subjectId: string;
  lanName: string;
  lanCode: string;
  original: boolean;
  type: number;
  detailPath: string;
}

export interface Subject {
  subjectId: string;
  subjectType: number; // 1 = Movie, 2 = TV Series, 7 = Short TV, etc.
  title: string;
  description: string;
  releaseDate: string;
  duration: number; // in seconds
  genre: string[];
  cover: ImageModel;
  countryName: string;
  imdbRatingValue: number;
  detailPath: string;
  corner?: string; // Dub/Language indicator, e.g. "Hindi"
  hasResource: boolean;
  season?: number;
  dubs?: DubModel[];
  imdbRatingCount?: number;
}

export interface BannerItem {
  id: string;
  title: string;
  image: ImageModel;
  url: string | null;
  subjectId: string;
  subjectType: number;
  subject: Subject | null;
  detailPath: string;
}

export interface FilterItem {
  title: string;
  url: string;
  query: string;
  image: ImageModel;
}

export interface PlatformItem {
  name: string;
  uploadBy: string;
}

export interface OperatingListItem {
  type: 'BANNER' | 'FILTER' | 'SUBJECTS_MOVIE' | 'CUSTOM' | 'SPORT_LIVE';
  position: number;
  title: string;
  subjects: Subject[];
  banner: {
    items: BannerItem[];
  } | null;
  filters: FilterItem[];
  customData: any;
  genreTopId: string | null;
  detailPath: string;
  opId?: string;
}

export interface HomepageData {
  platformList: PlatformItem[];
  operatingList: OperatingListItem[];
}

export interface StarModel {
  avatarUrl: string;
  character: string;
  detailPath: string;
  name: string;
  staffId: string;
  staffType: number;
}

export interface SeasonResolution {
  epNum: number;
  resolution: number;
}

export interface SeasonModel {
  allEp: string;
  maxEp: number;
  resolutions: SeasonResolution[];
  se: number; // Season number
}

export interface ResourceModel {
  seasons: SeasonModel[];
  source: string;
  uploadBy: string;
}

export interface ItemDetails {
  subject: Subject;
  stars: StarModel[];
  resource: ResourceModel;
  metadata: {
    description: string;
    image: string;
    keyWords: string[];
    title: string;
    referer?: string;
    url?: string;
  };
  isForbid: boolean;
  watchTimeLimit: number;
  related: Subject[];
}

export interface DownloadLink {
  id: string;
  url: string;
  resolution: number; // e.g. 360, 480, 720, 1080
  size: number; // bytes
}

export interface Caption {
  id: string;
  lan: string; // language code, e.g. "en"
  lanName: string; // e.g. "English"
  url: string; // subtitle file URL (.srt)
  size: number;
  delay: number;
}

export interface StreamData {
  downloads: DownloadLink[];
  captions: Caption[];
  hasResource: boolean;
  limited: boolean;
  limitedCode: string;
  stream_domain: string;
}

// Client API functions

async function fetchFromApi<T>(endpoint: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  // Build query string from params (filter out empty/undefined values)
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      searchParams.append(key, String(val));
    }
  });

  const queryString = searchParams.toString();
  const fullEndpoint = queryString ? `${endpoint}?${queryString}` : endpoint;

  // On the server, we need an absolute URL. On the client, relative works.
  const fetchUrl = isBrowser
    ? fullEndpoint
    : `${API_BASE_URL}${fullEndpoint}`;

  const response = await fetch(fetchUrl, {
    next: { revalidate: 3600 }, // Cache response for 1 hour
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch API endpoint ${endpoint}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}


export const movieApi = {
  // Get homepage data
  getHome: async (adult = false): Promise<HomepageData> => {
    return fetchFromApi<HomepageData>('/api/home', { adult });
  },

  // Get details for a movie/series
  getDetails: async (path: string, adult = false): Promise<ItemDetails> => {
    return fetchFromApi<ItemDetails>('/api/details', { path, adult });
  },

  // Get stream links and captions
  getStream: async (path: string, season = 0, episode = 0, adult = false): Promise<StreamData> => {
    return fetchFromApi<StreamData>('/api/stream', { path, season, episode, adult });
  },

  // Search movies and series
  search: async (q: string, page = 1, type?: number, adult = false): Promise<{ items: Subject[] }> => {
    return fetchFromApi<{ items: Subject[] }>('/api/search', { q, page, type: type ?? '', adult });
  },

  // Get category listing
  getCategory: async (name: string, page = 1, query?: string, adult = false): Promise<{ pager: { hasMore: boolean; nextPage: number; page: number; perPage: number; totalCount: number }; items: Subject[] }> => {
    return fetchFromApi('/api/category', { name, page, query: query ?? '', adult });
  }
};
