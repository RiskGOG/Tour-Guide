/**
 * api.js - Handles all external data fetching
 * Uses Wikipedia Geosearch + Nominatim (both fully free, no API keys, CORS-enabled)
 */

const API = {
    /**
     * Fetches all countries for the searchable datalist.
     */
    async getCountries() {
        try {
            const response = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2');
            const data = await response.json();
            return data.sort((a, b) => a.name.common.localeCompare(b.name.common));
        } catch (error) {
            console.error("Error fetching countries:", error);
            return [];
        }
    },

    /**
     * Geocodes a city/location name to Lat/Lon using Nominatim.
     */
    async geocode(query) {
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=en`;
            const response = await fetch(url);
            const data = await response.json();
            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lon: parseFloat(data[0].lon),
                    displayName: data[0].display_name
                };
            }
            console.warn("Nominatim: no result, using fallback Paris coords.");
            return { lat: 48.8566, lon: 2.3522, displayName: query };
        } catch (error) {
            console.error("Geocoding error:", error);
            return { lat: 48.8566, lon: 2.3522, displayName: query };
        }
    },

    /**
     * Fetches REAL named tourist places around a lat/lon using Wikipedia's Geosearch API.
     * This is 100% free, no API key required, and fully CORS-enabled.
     */
    async getPOIs(lat, lon, radius, interests) {
        try {
            const limit = 60;
            const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lon}&gsradius=${radius}&gslimit=${limit}&format=json&origin=*`;
            
            const response = await fetch(url);
            const data = await response.json();

            if (!data.query || !data.query.geosearch || data.query.geosearch.length === 0) {
                console.warn("Wikipedia geosearch returned no results.");
                return this.getCuratedFallback(lat, lon);
            }

            const geoResults = data.query.geosearch;

            // Now fetch summaries/categories to classify each place
            const pageids = geoResults.map(r => r.pageid).join('|');
            const categoryUrl = `https://en.wikipedia.org/w/api.php?action=query&pageids=${pageids}&prop=categories|extracts&exsentences=2&exintro=1&explaintext=1&format=json&origin=*&cllimit=5`;
            
            let categoryData = {};
            try {
                const catResponse = await fetch(categoryUrl);
                const catJson = await catResponse.json();
                categoryData = catJson.query ? catJson.query.pages : {};
            } catch(e) {
                console.warn("Could not fetch Wikipedia categories:", e);
            }

            // Merge geo data with category data
            const pois = geoResults.map((result, index) => {
                const pageData = categoryData[result.pageid] || {};
                const cats = (pageData.categories || []).map(c => c.title.toLowerCase());
                const summary = pageData.extract || '';

                // Classify based on Wikipedia categories
                let category = 'Attraction';
                if (cats.some(c => c.includes('museum') || c.includes('gallery'))) category = 'Museum';
                else if (cats.some(c => c.includes('park') || c.includes('garden') || c.includes('forest'))) category = 'Park';
                else if (cats.some(c => c.includes('temple') || c.includes('mosque') || c.includes('church') || c.includes('shrine'))) category = 'Religious Site';
                else if (cats.some(c => c.includes('fort') || c.includes('palace') || c.includes('monument') || c.includes('memorial'))) category = 'Historic Site';
                else if (cats.some(c => c.includes('restaurant') || c.includes('food') || c.includes('cuisine'))) category = 'Restaurant';
                else if (cats.some(c => c.includes('market') || c.includes('mall') || c.includes('shopping'))) category = 'Shopping';
                else if (cats.some(c => c.includes('lake') || c.includes('river') || c.includes('beach') || c.includes('waterfall'))) category = 'Nature';
                else if (cats.some(c => c.includes('tower') || c.includes('hill') || c.includes('viewpoint'))) category = 'Viewpoint';
                else {
                    // Classify from title keywords as fallback
                    const t = result.title.toLowerCase();
                    if (t.includes('museum') || t.includes('gallery')) category = 'Museum';
                    else if (t.includes('park') || t.includes('garden')) category = 'Park';
                    else if (t.includes('temple') || t.includes('church') || t.includes('mosque') || t.includes('masjid') || t.includes('mandir')) category = 'Religious Site';
                    else if (t.includes('fort') || t.includes('palace') || t.includes('qila') || t.includes('mahal') || t.includes('memorial') || t.includes('monument')) category = 'Historic Site';
                    else if (t.includes('market') || t.includes('bazaar') || t.includes('chowk')) category = 'Shopping';
                    else if (t.includes('lake') || t.includes('river') || t.includes('beach')) category = 'Nature';
                }

                // Filter by user interests if they're using specific ones
                // (Wikipedia API doesn't filter by category, so we do it client-side)
                const interestCategoryMap = {
                    'museum': ['Museum'],
                    'park': ['Park', 'Nature'],
                    'historic': ['Historic Site', 'Religious Site'],
                    'restaurant': ['Restaurant'],
                    'shopping': ['Shopping'],
                    'viewpoint': ['Viewpoint']
                };

                // Only include if category matches interests (or if no filter match is possible, include all)
                const allowedCategories = interests.flatMap(i => interestCategoryMap[i] || []);
                const isRelevant = allowedCategories.length === 0 || allowedCategories.includes(category) || category === 'Attraction';

                if (!isRelevant) return null;

                return {
                    id: `N${index + 1}`,
                    name: result.title,
                    category: category,
                    lat: result.lat,
                    lon: result.lon,
                    neighborhood: 'City Area',
                    summary: summary.substring(0, 150) + (summary.length > 150 ? '...' : ''),
                    wikiUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`
                };
            }).filter(p => p !== null);

            return pois.length > 0 ? pois : this.getCuratedFallback(lat, lon);

        } catch (error) {
            console.error("Wikipedia API error:", error);
            return this.getCuratedFallback(lat, lon);
        }
    },

    /**
     * Curated fallback data if all APIs fail (still uses real coordinates).
     */
    getCuratedFallback(baseLat, baseLon) {
        console.log("Using curated fallback data.");
        const places = [
            { name: "Central Museum", category: "Museum" },
            { name: "City Park", category: "Park" },
            { name: "Historic Fort", category: "Historic Site" },
            { name: "Local Market", category: "Shopping" },
            { name: "Waterfront Promenade", category: "Nature" },
            { name: "Cathedral", category: "Religious Site" },
            { name: "Botanical Garden", category: "Park" },
            { name: "Art Gallery", category: "Museum" },
            { name: "Old Town Square", category: "Historic Site" },
            { name: "Night Bazaar", category: "Shopping" },
            { name: "Hilltop Viewpoint", category: "Viewpoint" },
            { name: "Famous Restaurant District", category: "Restaurant" },
        ];
        return places.map((p, i) => ({
            id: `N${i + 1}`,
            name: p.name,
            category: p.category,
            lat: baseLat + (Math.random() - 0.5) * 0.04,
            lon: baseLon + (Math.random() - 0.5) * 0.04,
            neighborhood: 'City Center',
            summary: '',
            wikiUrl: ''
        }));
    },

    /**
     * Generates a Google Maps Directions URL for a day's route.
     * Opens in a new tab with turn-by-turn directions for each stop.
     */
    getGoogleMapsRouteUrl(locations) {
        if (!locations || locations.length < 2) return null;

        const waypoints = locations.map(l => `${l.lat},${l.lon}`);
        const origin = waypoints[0];
        const destination = waypoints[waypoints.length - 1];
        const middle = waypoints.slice(1, -1);

        let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
        if (middle.length > 0) {
            url += `&waypoints=${middle.join('|')}`;
        }
        url += `&travelmode=walking`;
        return url;
    }
};

window.API = API;
