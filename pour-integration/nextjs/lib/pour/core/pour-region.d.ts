declare const PourRegion: {
  parse(input: string): 
    | { status: "empty" }
    | { status: "resolved"; region: string; city: string; label: string }
    | { status: "ambiguous"; candidates: { region: string; city: string; label: string }[] }
    | { status: "notfound"; input: string };
  suggest(input: string, limit?: number): { region: string; city: string; label: string }[];
  format(region: string, city: string): string;
  normalizeCity(text: string): string;
  all(): { region: string; city: string; label: string }[];
  provinces(): string[];
};

export default PourRegion;
