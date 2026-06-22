import {
  GENRES,
  Track,
  TrackGenre,
  tracksForGenre,
} from "@/app/lib/catalog";

type SpotifyTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
};

type SpotifyTrackItem = {
  id: string;
  name: string;
  preview_url: string | null;
  external_urls?: {
    spotify?: string;
  };
  album?: {
    images?: Array<{
      url: string;
      width: number | null;
      height: number | null;
    }>;
  };
  artists?: Array<{
    name: string;
  }>;
};

type SpotifySearchResponse = {
  tracks?: {
    items?: SpotifyTrackItem[];
  };
  error?: {
    message?: string;
  };
};

type ITunesSearchResponse = {
  results?: Array<{
    trackId?: number;
    trackName?: string;
    artistName?: string;
    artworkUrl100?: string;
    collectionViewUrl?: string;
    previewUrl?: string;
  }>;
};

const SPOTIFY_GENRE_QUERIES: Record<TrackGenre, string[]> = {
  Pop: ["genre:pop"],
  Rock: ["genre:rock"],
  "Hip-Hop": ["genre:hip-hop", "genre:rap"],
  Electronic: ["genre:electronic", "genre:edm"],
  Jazz: ["genre:jazz"],
  "R&B": ["genre:r-n-b", "genre:soul"],
};

const TRACK_COLORS = [
  "#f9738a",
  "#f59e0b",
  "#38bdf8",
  "#a3e635",
  "#8b5cf6",
  "#14b8a6",
  "#f43f5e",
  "#2563eb",
];

const ITUNES_GENRE_TERMS: Record<TrackGenre, string> = {
  Pop: "pop hits",
  Rock: "rock hits",
  "Hip-Hop": "hip hop hits",
  Electronic: "electronic dance",
  Jazz: "jazz standards",
  "R&B": "r&b hits",
};

function isTrackGenre(value: string | null): value is TrackGenre {
  return GENRES.includes(value as TrackGenre);
}

function spotifyCredentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials are missing.");
  }

  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function getSpotifyAccessToken() {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${spotifyCredentials()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as SpotifyTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error ?? "Spotify token request failed.");
  }

  return payload.access_token;
}

async function findITunesPreviewUrl(title: string, artist: string) {
  const params = new URLSearchParams({
    term: `${title} ${artist}`,
    media: "music",
    entity: "song",
    country: "US",
    limit: "5",
  });

  const response = await fetch(
    `https://itunes.apple.com/search?${params.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as ITunesSearchResponse;
  const normalizedTitle = title.toLowerCase();
  const normalizedArtist = artist.toLowerCase();
  const primaryArtist = normalizedArtist.split(",")[0]?.trim() ?? normalizedArtist;
  const result =
    payload.results?.find((item) => {
      const itemTitle = item.trackName?.toLowerCase() ?? "";
      const itemArtist = item.artistName?.toLowerCase() ?? "";

      return (
        item.previewUrl &&
        (normalizedTitle.includes(itemTitle) ||
          itemTitle.includes(normalizedTitle)) &&
        (normalizedArtist.includes(itemArtist) ||
          itemArtist.includes(primaryArtist))
      );
    }) ?? payload.results?.find((item) => item.previewUrl);

  return result?.previewUrl ?? null;
}

async function searchITunesGenre(genre: TrackGenre) {
  const params = new URLSearchParams({
    term: ITUNES_GENRE_TERMS[genre],
    media: "music",
    entity: "song",
    country: "US",
    limit: "25",
  });

  const response = await fetch(
    `https://itunes.apple.com/search?${params.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("iTunes preview search failed.");
  }

  const payload = (await response.json()) as ITunesSearchResponse;
  const uniqueTracks = new Map<string, Track>();

  for (const [index, item] of (payload.results ?? []).entries()) {
    if (!item.previewUrl || !item.trackName || !item.artistName) {
      continue;
    }

    const id = `itunes-${item.trackId ?? `${item.artistName}-${item.trackName}`}`;

    if (uniqueTracks.has(id)) {
      continue;
    }

    uniqueTracks.set(id, {
      id,
      title: item.trackName,
      artist: item.artistName,
      genre,
      audioUrl: item.previewUrl,
      color: TRACK_COLORS[index % TRACK_COLORS.length],
      artworkUrl: item.artworkUrl100?.replace("100x100", "600x600"),
      externalUrl: item.collectionViewUrl,
      source: "spotify",
      previewProvider: "itunes",
    });
  }

  return Array.from(uniqueTracks.values()).slice(0, 20);
}

async function toGameTrack(
  item: SpotifyTrackItem,
  genre: TrackGenre,
  index: number,
): Promise<Track | null> {
  const artist = item.artists?.map((entry) => entry.name).join(", ") ?? "Unknown";
  const previewUrl = item.preview_url ?? (await findITunesPreviewUrl(item.name, artist));

  if (!previewUrl) {
    return null;
  }

  return {
    id: `spotify-${item.id}`,
    title: item.name,
    artist,
    genre,
    audioUrl: previewUrl,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    artworkUrl: item.album?.images?.[0]?.url,
    externalUrl: item.external_urls?.spotify,
    source: "spotify",
    previewProvider: item.preview_url ? "spotify" : "itunes",
  };
}

async function searchSpotifyGenre(accessToken: string, genre: TrackGenre) {
  const uniqueTracks = new Map<string, Track>();

  for (const query of SPOTIFY_GENRE_QUERIES[genre]) {
    const params = new URLSearchParams({
      q: query,
      type: "track",
      market: "US",
      limit: "10",
    });

    const response = await fetch(
      `https://api.spotify.com/v1/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as SpotifySearchResponse;

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Spotify search failed.");
    }

    const tracks = await Promise.all(
      (payload.tracks?.items ?? []).map((item, index) =>
        toGameTrack(item, genre, uniqueTracks.size + index),
      ),
    );

    for (const track of tracks) {
      if (track && !uniqueTracks.has(track.id)) {
        uniqueTracks.set(track.id, track);
      }
    }
  }

  return Array.from(uniqueTracks.values()).slice(0, 20);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const genre = searchParams.get("genre");

    if (!isTrackGenre(genre)) {
      return Response.json({ error: "Invalid genre." }, { status: 400 });
    }

    let tracks: Track[] = [];

    try {
      const accessToken = await getSpotifyAccessToken();
      tracks = await searchSpotifyGenre(accessToken, genre);
    } catch (error) {
      console.error("Spotify search failed", error);
    }

    if (tracks.length < 5) {
      const fallbackTracks = await searchITunesGenre(genre);

      if (fallbackTracks.length >= 5) {
        return Response.json({
          source: "spotify",
          warning:
            "Spotify did not return enough playable preview URLs, so playable previews were loaded from iTunes.",
          tracks: fallbackTracks,
        });
      }

      return Response.json({
        source: "demo",
        warning:
          "Music preview providers did not return enough playable preview URLs for this genre.",
        tracks: tracksForGenre(genre),
      });
    }

    return Response.json({ source: "spotify", tracks });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected Spotify error.";
    return Response.json({ error: message }, { status: 500 });
  }
}
