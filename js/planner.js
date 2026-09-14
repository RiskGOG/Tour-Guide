/**
 * planner.js - Core logic for generating the itinerary graph
 */

const Planner = {
    /**
     * Calculates the Haversine distance between two points in km.
     */
    getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    /**
     * Groups POIs into daily clusters using a basic greedy geographic approach.
     */
    generateItinerary(pois, days, hotelLocation) {
        if (!pois || pois.length === 0) return { nodes: [], edges: [], dailyPlan: {} };

        // 1. Prepare Nodes
        const nodes = [...pois];
        let hotelNode = null;
        
        if (hotelLocation) {
            hotelNode = {
                id: 'H1',
                name: hotelLocation.name || 'Your Hotel',
                category: 'Hotel',
                lat: hotelLocation.lat,
                lon: hotelLocation.lon,
                neighborhood: 'Base'
            };
            // Add hotel to nodes if not already there
            nodes.unshift(hotelNode);
        }

        // 2. Cluster nodes into days (Simple K-Means or Greedy approach)
        // For simplicity and speed in the browser, we'll do a greedy geographic grouping
        
        // Items to visit per day (distribute evenly)
        const itemsPerDay = Math.max(2, Math.floor((nodes.filter(n => n.category !== 'Hotel').length) / days));
        
        const unvisited = nodes.filter(n => n.category !== 'Hotel');
        const dailyPlan = {};
        const edges = [];

        for (let day = 1; day <= days; day++) {
            dailyPlan[day] = [];
            
            if (unvisited.length === 0) break;

            // Start point for the day
            let currentPoint = hotelNode || unvisited[0];
            if (!hotelNode && day === 1) {
                // If no hotel, first point of day 1 is just the first unvisited
                dailyPlan[day].push(currentPoint);
                unvisited.splice(unvisited.indexOf(currentPoint), 1);
            } else if (hotelNode) {
                dailyPlan[day].push(hotelNode);
            }

            let itemsAddedThisDay = 0;
            const targetItems = (day === days) ? unvisited.length : itemsPerDay; // Last day gets remainder

            while (itemsAddedThisDay < targetItems && unvisited.length > 0) {
                // Find nearest unvisited point
                let nearestIdx = 0;
                let minDistance = Infinity;

                for (let i = 0; i < unvisited.length; i++) {
                    const dist = this.getDistance(
                        currentPoint.lat, currentPoint.lon,
                        unvisited[i].lat, unvisited[i].lon
                    );
                    if (dist < minDistance) {
                        minDistance = dist;
                        nearestIdx = i;
                    }
                }

                const nextPoint = unvisited[nearestIdx];
                
                // Create an edge (Route)
                let transport = minDistance > 2 ? 'Transit/Taxi' : 'Walk';
                edges.push({
                    source: currentPoint.id,
                    target: nextPoint.id,
                    day: `Day ${day}`,
                    transport: transport,
                    distance: minDistance.toFixed(1)
                });

                dailyPlan[day].push(nextPoint);
                unvisited.splice(nearestIdx, 1);
                currentPoint = nextPoint;
                itemsAddedThisDay++;
            }

            // Return to hotel at end of day if hotel exists
            if (hotelNode && dailyPlan[day].length > 1) {
                const dist = this.getDistance(
                    currentPoint.lat, currentPoint.lon,
                    hotelNode.lat, hotelNode.lon
                );
                let transport = dist > 2 ? 'Transit/Taxi' : 'Walk';
                edges.push({
                    source: currentPoint.id,
                    target: hotelNode.id,
                    day: `Day ${day}`,
                    transport: transport,
                    distance: dist.toFixed(1)
                });
                // Note: We don't push hotel again to dailyPlan array to keep UI clean, 
                // but the edge exists in the graph.
            }
        }

        return {
            nodes: nodes,
            edges: edges,
            dailyPlan: dailyPlan
        };
    }
};

window.Planner = Planner;
