export interface GdeltArticle {
    url: string;
    url_mobile: string;
    title: string;
    seendate: string;
    socialimage: string;
    domain: string;
    language: string;
    sourcecountry: string;
}

export interface GdeltResponse {
    articles: GdeltArticle[];
}

export class GdeltAPI {
    private static lastRequestTime = 0;
    private static readonly RATE_LIMIT_MS = 6000; // 6 seconds as requested
    private static callbackCounter = 0;

    /**
     * Fetches articles from the GDELT DOC 2.0 API using JSONP to bypass CORS.
     * Respects the 1 request per 5 seconds rate limit (padded to 6 seconds).
     * @param query The search query string
     * @param maxRecords Maximum number of records to return (max 250)
     */
    static async fetchArticles(query: string, maxRecords: number = 75): Promise<GdeltArticle[]> {
        // Enforce rate limit
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.RATE_LIMIT_MS) {
            const waitTime = this.RATE_LIMIT_MS - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
        this.callbackCounter++;
        const callbackName = `gdeltCallback_${Date.now()}_${this.callbackCounter}`;

        return new Promise((resolve, reject) => {
            // Setup global callback
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any)[callbackName] = (data: GdeltResponse) => {
                cleanup();
                if (data && data.articles) {
                    resolve(data.articles);
                } else {
                    resolve([]); // Return empty array if no articles
                }
            };

            // Inject script tag
            const script = document.createElement('script');

            // Build URL
            const encodedQuery = encodeURIComponent(`"${query}"`);
            const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodedQuery}&mode=artlist&format=jsonp&callback=${callbackName}&maxrecords=${Math.min(maxRecords, 250)}`;

            script.src = url;
            script.async = true;

            script.onerror = () => {
                cleanup();
                reject(new Error("Failed to load script from GDELT API."));
            };

            // Append to DOM to trigger request
            document.body.appendChild(script);

            // Cleanup function
            const cleanup = () => {
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                delete // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any)[callbackName];
            };

            // Timeout after 15 seconds
            setTimeout(() => {
                if (// eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any)[callbackName]) {
                    cleanup();
                    reject(new Error("Request to GDELT API timed out."));
                }
            }, 15000);
        });
    }
}
