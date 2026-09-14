/**
 * visualizations.js — 11 Interactive Graph Visualizations
 * Trip Tour Planner · Graph Visualization Project
 */

const Visualizations = {
    map: null,
    network: null,
    markerRefs: {},
    mapLayers: {},      // { 'Day 1': [layers...], 'all': [layers...] }

    colors: {
        'Museum':        '#ef4444',
        'Park':          '#22c55e',
        'Restaurant':    '#eab308',
        'Historic Site': '#a855f7',
        'Shopping':      '#ec4899',
        'Viewpoint':     '#0ea5e9',
        'Nature':        '#06b6d4',
        'Religious Site':'#f97316',
        'Hotel':         '#1e293b',
        'Attraction':    '#6366f1'
    },

    dayColors: ['#4f46e5','#db2777','#0ea5e9','#16a34a','#d97706','#9333ea','#0891b2'],

    _font: "'Inter', sans-serif",

    // ─── SHARED: D3 Tooltip ─────────────────────
    _createTooltip(container) {
        let tip = container.querySelector('.d3-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.className = 'd3-tooltip';
            tip.style.opacity = '0';
            container.appendChild(tip);
        }
        return tip;
    },
    _showTooltip(tip, html, event) {
        tip.innerHTML = html;
        tip.style.opacity = '1';
        const rect = tip.parentElement.getBoundingClientRect();
        const x = (event.clientX || event.pageX) - rect.left + 14;
        const y = (event.clientY || event.pageY) - rect.top - 10;
        tip.style.left = Math.min(x, rect.width - 230) + 'px';
        tip.style.top = Math.max(y, 4) + 'px';
    },
    _hideTooltip(tip) { tip.style.opacity = '0'; },

    // ════════════════════════════════════════════
    // 1. GIS MAP — Numbered markers, animated routes, day filter
    // ════════════════════════════════════════════
    renderMap(nodes, edges, centerLat, centerLon) {
        if (this.map) { this.map.remove(); this.map = null; }
        this.markerRefs = {};
        this.mapLayers = {};

        this.map = L.map('view-map', { zoomControl: true }).setView([centerLat, centerLon], 13);

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri'
        }).addTo(this.map);

        this.buildMapLegend(nodes);

        const nodeMap = {};
        nodes.forEach(n => nodeMap[n.id] = n);

        // Build a visit sequence counter
        const visitOrder = {};
        let seq = 1;
        edges.forEach(e => {
            if (!visitOrder[e.source]) visitOrder[e.source] = seq++;
            if (!visitOrder[e.target]) visitOrder[e.target] = seq++;
        });

        // Draw edges with animated dashes
        edges.forEach(e => {
            const src = nodeMap[e.source], tgt = nodeMap[e.target];
            if (!src || !tgt) return;
            const dayNum = parseInt(e.day.replace('Day ', '')) || 1;
            const color = this.dayColors[(dayNum - 1) % this.dayColors.length];
            const line = L.polyline([[src.lat, src.lon], [tgt.lat, tgt.lon]], {
                color, weight: 3.5, opacity: 0.8,
                dashArray: e.transport === 'Walk' ? '6,8' : null,
                className: `route-animated day-route-${dayNum}`
            }).bindTooltip(`${e.day} · ${e.transport} · ${e.distance} km`, { sticky: true });
            line.addTo(this.map);

            if (!this.mapLayers[dayNum]) this.mapLayers[dayNum] = [];
            this.mapLayers[dayNum].push(line);
        });

        // Draw numbered markers
        nodes.forEach(n => {
            const color = this.colors[n.category] || this.colors['Attraction'];
            const isHotel = n.category === 'Hotel';
            const num = visitOrder[n.id] || '★';

            const icon = L.divIcon({
                className: '',
                iconAnchor: [14, 32],
                popupAnchor: [0, -34],
                html: `<div class="${isHotel ? 'numbered-marker hotel-marker' : 'numbered-marker'}" style="background:${color};"><span>${isHotel ? '🏨' : num}</span></div>`
            });

            const popupHtml = `
                <div class="popup-title">${n.name}</div>
                <div class="popup-cat" style="color:${color};font-weight:600;">${n.category}</div>
                ${n.summary ? `<div style="font-size:11px;color:#64748b;margin-top:4px;line-height:1.4;">${n.summary}</div>` : ''}
                ${n.wikiUrl ? `<a class="popup-link" href="${n.wikiUrl}" target="_blank">📖 Wikipedia</a>` : ''}
            `;

            const marker = L.marker([n.lat, n.lon], { icon })
                .bindPopup(popupHtml, { maxWidth: 240 })
                .addTo(this.map);

            this.markerRefs[n.id] = marker;

            // Store day association for filtering
            const dayNum = edges.find(e => e.source === n.id || e.target === n.id);
            if (dayNum) {
                const d = parseInt(dayNum.day.replace('Day ', '')) || 1;
                if (!this.mapLayers[d]) this.mapLayers[d] = [];
                this.mapLayers[d].push(marker);
            }
        });

        // Fit bounds
        if (nodes.length > 0) {
            const bounds = L.latLngBounds(nodes.map(n => [n.lat, n.lon]));
            this.map.fitBounds(bounds.pad(0.12));
        }

        setTimeout(() => this.map && this.map.invalidateSize(), 150);
    },

    // Filter map by day
    filterMapByDay(day) {
        if (!this.map) return;
        const allDays = Object.keys(this.mapLayers);
        if (day === 'all') {
            allDays.forEach(d => {
                (this.mapLayers[d] || []).forEach(l => { if (!this.map.hasLayer(l)) this.map.addLayer(l); });
            });
        } else {
            allDays.forEach(d => {
                (this.mapLayers[d] || []).forEach(l => {
                    if (String(d) === String(day)) { if (!this.map.hasLayer(l)) this.map.addLayer(l); }
                    else { if (this.map.hasLayer(l)) this.map.removeLayer(l); }
                });
            });
        }
    },

    buildMapLegend(nodes) {
        const legendEl = document.getElementById('map-legend');
        if (!legendEl) return;
        const cats = [...new Set(nodes.map(n => n.category))];
        const itemsEl = document.getElementById('legend-items');
        itemsEl.innerHTML = '';
        cats.forEach(cat => {
            const color = this.colors[cat] || '#6366f1';
            itemsEl.innerHTML += `<div class="flex items-center gap-2 mb-1 text-gray-600">
                <div style="width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0;"></div>
                <span>${cat}</span>
            </div>`;
        });
        const mapView = document.getElementById('view-map');
        legendEl.style.position = 'absolute';
        legendEl.style.bottom = '12px';
        legendEl.style.right = '12px';
        legendEl.style.zIndex = '500';
        mapView.style.position = 'relative';
        mapView.appendChild(legendEl);
        legendEl.classList.remove('hidden');
    },

    bounceMarker(nodeId) {
        const marker = this.markerRefs[nodeId];
        if (marker) marker.openPopup();
    },

    // ════════════════════════════════════════════
    // 2. NETWORK GRAPH — Proportional edges
    // ════════════════════════════════════════════
    renderNetwork(nodesData, edgesData) {
        const container = document.getElementById('view-network');

        const maxDist = Math.max(...edgesData.map(e => parseFloat(e.distance) || 1));

        const vNodes = new vis.DataSet(nodesData.map(n => ({
            id: n.id,
            label: n.name.length > 20 ? n.name.slice(0, 18) + '…' : n.name,
            title: `<b>${n.name}</b><br><i>${n.category}</i>`,
            color: {
                background: this.colors[n.category] || this.colors['Attraction'],
                border: '#ffffff',
                highlight: { background: '#fbbf24', border: '#ffffff' }
            },
            font: { color: '#ffffff', size: 12, face: 'Inter', bold: true },
            shape: n.category === 'Hotel' ? 'box' : 'dot',
            size: n.category === 'Hotel' ? 24 : 16,
            borderWidth: 3,
            shadow: { enabled: true, size: 8, color: 'rgba(0,0,0,0.3)' }
        })));

        const vEdges = new vis.DataSet(edgesData.map(e => {
            const dayNum = parseInt(e.day.replace('Day ', '')) || 1;
            const color = this.dayColors[(dayNum - 1) % this.dayColors.length];
            const dist = parseFloat(e.distance) || 1;
            return {
                from: e.source,
                to: e.target,
                label: `${e.distance}km`,
                arrows: { to: { enabled: true, scaleFactor: 0.9 } },
                color: { color, highlight: '#fbbf24', opacity: 0.85 },
                font: { size: 10, color: '#94a3b8', align: 'middle', face: 'Inter' },
                dashes: e.transport === 'Walk',
                width: Math.max(1.5, (dist / maxDist) * 6),
                smooth: { type: 'curvedCW', roundness: 0.2 },
                title: `${e.day} · ${e.transport} · ${e.distance} km`
            };
        }));

        const options = {
            background: { color: '#0f172a' },
            nodes: { borderWidthSelected: 4 },
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -5000,
                    centralGravity: 0.3,
                    springLength: 200,
                    springConstant: 0.04,
                    damping: 0.12
                },
                stabilization: { iterations: 200 }
            },
            interaction: {
                hover: true,
                tooltipDelay: 80,
                navigationButtons: false,
                zoomView: true
            },
            layout: { improvedLayout: true }
        };

        if (this.network) this.network.destroy();
        this.network = new vis.Network(container, { nodes: vNodes, edges: vEdges }, options);
    },

    // ════════════════════════════════════════════
    // 3. DENDROGRAM — Animated, collapsible, tooltip
    // ════════════════════════════════════════════
    renderDendrogram(nodesData, cityName) {
        const container = document.getElementById('view-dendrogram');
        container.innerHTML = '';
        const W = container.clientWidth || 800;
        const H = container.clientHeight || 600;
        const tip = this._createTooltip(container);

        const byCat = {};
        nodesData.forEach(n => {
            const cat = n.category || 'Attraction';
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push({ name: n.name, category: cat, wikiUrl: n.wikiUrl });
        });

        const hierarchyData = {
            name: cityName || 'Destination',
            children: Object.entries(byCat).map(([cat, places]) => ({ name: cat, children: places }))
        };

        const root = d3.hierarchy(hierarchyData);
        const leafCount = root.leaves().length;
        const treeH = Math.max(H, leafCount * 34);

        d3.cluster().size([treeH, W - 300])(root);

        const svg = d3.select(container).append('svg')
            .attr('width', W).attr('height', H)
            .style('background', 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)')
            .style('cursor', 'grab').style('display', 'block');

        const g = svg.append('g').attr('transform', 'translate(80, 0)');

        const zoom = d3.zoom().scaleExtent([0.15, 5])
            .on('zoom', e => { g.attr('transform', e.transform); svg.style('cursor', 'grabbing'); })
            .on('end', () => svg.style('cursor', 'grab'));
        svg.call(zoom);

        const initialTY = (H - treeH) / 2;
        svg.call(zoom.transform, d3.zoomIdentity.translate(80, Math.min(0, initialTY)));

        const catColor = this.colors;

        // Links — animated entry
        const links = g.selectAll('.link')
            .data(root.descendants().slice(1)).enter().append('path')
            .attr('fill', 'none')
            .attr('stroke', d => { let a = d; while (a.depth > 1) a = a.parent; return catColor[a.data.name] || '#94a3b8'; })
            .attr('stroke-width', d => d.depth === 1 ? 3 : 1.5)
            .attr('stroke-opacity', 0)
            .attr('d', d => {
                const midX = (d.y + d.parent.y) / 2;
                return `M${d.y},${d.x} C${midX},${d.x} ${midX},${d.parent.x} ${d.parent.y},${d.parent.x}`;
            });
        links.transition().duration(800).delay((d, i) => i * 15).attr('stroke-opacity', d => d.depth === 1 ? 0.7 : 0.45);

        // Nodes
        const node = g.selectAll('.node').data(root.descendants()).enter().append('g')
            .attr('transform', d => `translate(${d.y},${d.x})`).style('cursor', 'pointer');

        node.append('circle')
            .attr('r', 0)
            .attr('fill', d => {
                if (d.depth === 0) return '#4f46e5';
                if (d.depth === 1) return catColor[d.data.name] || '#94a3b8';
                return catColor[d.parent.data.name] || '#c7d2fe';
            })
            .attr('stroke', '#fff').attr('stroke-width', 2.5)
            .style('filter', d => d.depth < 2 ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' : 'none')
            .transition().duration(500).delay((d, i) => i * 20)
            .attr('r', d => d.depth === 0 ? 14 : d.depth === 1 ? 9 : 5);

        // Labels
        node.append('text')
            .attr('dy', '0.32em')
            .attr('x', d => d.children ? -16 : 14)
            .attr('text-anchor', d => d.children ? 'end' : 'start')
            .style('font-size', d => d.depth === 0 ? '16px' : d.depth === 1 ? '13px' : '11px')
            .style('font-weight', d => d.depth < 2 ? '700' : '400')
            .style('fill', d => d.depth === 0 ? '#1e1b4b' : d.depth === 1 ? '#1e293b' : '#475569')
            .style('font-family', this._font)
            .style('opacity', 0)
            .text(d => d.data.name.length > 32 ? d.data.name.slice(0, 29) + '…' : d.data.name)
            .transition().duration(400).delay((d, i) => 300 + i * 15).style('opacity', 1);

        // Hover tooltip for leaf nodes
        node.filter(d => !d.children)
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget).select('circle').transition().duration(150).attr('r', 8);
                const cat = d.parent ? d.parent.data.name : '';
                this._showTooltip(tip, `<div class="tt-title">${d.data.name}</div><div class="tt-sub">${cat}</div>`, event);
            })
            .on('mouseout', (event) => {
                d3.select(event.currentTarget).select('circle').transition().duration(150).attr('r', 5);
                this._hideTooltip(tip);
            });

        // Click-to-collapse on category nodes
        node.filter(d => d.depth === 1).on('click', function(event, d) {
            d._collapsed = !d._collapsed;
            const childNodes = g.selectAll('.node').filter(n => n.parent === d);
            const childLinks = g.selectAll('.link').filter(n => n.parent === d);
            const vis = d._collapsed ? 0 : 1;
            childNodes.transition().duration(300).style('opacity', vis);
            childLinks.transition().duration(300).attr('stroke-opacity', vis * 0.45);
            d3.select(this).select('circle')
                .transition().duration(200)
                .attr('r', d._collapsed ? 12 : 9)
                .attr('stroke-dasharray', d._collapsed ? '3,2' : null);
        });

        this._addZoomHint(container);
    },

    // ════════════════════════════════════════════
    // 4. STATS & ANALYSIS — D3 Charts
    // ════════════════════════════════════════════
    renderStats(nodes, edges, dailyPlan, cityName, totalDays) {
        const container = document.getElementById('stats-content');
        if (!container) return;

        const nonHotel = nodes.filter(n => n.category !== 'Hotel');
        const totalKm  = edges.reduce((s, e) => s + parseFloat(e.distance || 0), 0);
        const uniqueCats = {};
        nonHotel.forEach(n => { uniqueCats[n.category] = (uniqueCats[n.category] || 0) + 1; });

        const kmPerDay = [];
        for (const [day] of Object.entries(dailyPlan)) {
            const dayEdges = edges.filter(e => e.day === `Day ${day}`);
            const km = dayEdges.reduce((s, e) => s + parseFloat(e.distance || 0), 0);
            kmPerDay.push({ day, km: +km.toFixed(1) });
        }

        // Build the HTML shell, then inject D3 charts after
        container.innerHTML = `
            <h2 class="text-2xl font-bold text-gray-900 mb-1">Trip Summary</h2>
            <p class="text-gray-500 mb-6">Analysis for <span class="font-semibold text-indigo-600">${cityName}</span> — ${totalDays} days, ${nonHotel.length} places, ${totalKm.toFixed(1)} km total</p>

            <!-- KPI Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white text-center">
                    <div class="text-4xl font-black">${nonHotel.length}</div>
                    <div class="text-sm font-medium opacity-80 mt-1">Total Places</div>
                </div>
                <div class="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white text-center">
                    <div class="text-4xl font-black">${totalDays}</div>
                    <div class="text-sm font-medium opacity-80 mt-1">Days</div>
                </div>
                <div class="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white text-center">
                    <div class="text-4xl font-black">${totalKm.toFixed(1)}</div>
                    <div class="text-sm font-medium opacity-80 mt-1">km Total</div>
                </div>
                <div class="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white text-center">
                    <div class="text-4xl font-black">${Object.keys(uniqueCats).length}</div>
                    <div class="text-sm font-medium opacity-80 mt-1">Categories</div>
                </div>
            </div>

            <!-- Donut + Area side by side -->
            <div class="grid md:grid-cols-2 gap-6 mb-8">
                <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span class="w-2 h-5 bg-indigo-500 rounded-full"></span> Category Distribution
                    </h3>
                    <div id="stats-donut" style="height:220px;"></div>
                </div>
                <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span class="w-2 h-5 bg-emerald-500 rounded-full"></span> Distance Per Day
                    </h3>
                    <div id="stats-area" style="height:220px;"></div>
                </div>
            </div>

            <!-- How It Works — All 11 graphs -->
            <div class="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl p-6">
                <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-diagram-project text-indigo-400"></i> How the Graph Analysis Works
                </h3>
                <div class="grid md:grid-cols-3 gap-3 text-sm">
                    <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div class="text-indigo-300 font-bold mb-1">🗺️ GIS Map</div>
                        <p class="text-slate-300 leading-relaxed text-xs">Real GPS coordinates via Nominatim geocoding. Edges show travel paths color-coded per day with animated dash flow.</p>
                    </div>
                    <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div class="text-purple-300 font-bold mb-1">🔗 Route Network</div>
                        <p class="text-slate-300 leading-relaxed text-xs">Force-directed graph with physics simulation. Edge thickness proportional to Haversine distance.</p>
                    </div>
                    <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div class="text-cyan-300 font-bold mb-1">🌳 Dendrogram</div>
                        <p class="text-slate-300 leading-relaxed text-xs">Hierarchical cluster tree: City → Category → Place. Click categories to collapse. Cubic bezier links.</p>
                    </div>
                    <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div class="text-blue-300 font-bold mb-1">☀️ Radial Tree</div>
                        <p class="text-slate-300 leading-relaxed text-xs">Same hierarchy projected onto a radial layout. Nodes arranged in a sunburst circle pattern.</p>
                    </div>
                    <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div class="text-amber-300 font-bold mb-1">📅 Timeline</div>
                        <p class="text-slate-300 leading-relaxed text-xs">Gantt chart mapping attractions to a 9 AM – 8 PM daily schedule with proportional time blocks.</p>
                    </div>
                    <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div class="text-emerald-300 font-bold mb-1">🟦 Treemap</div>
                        <p class="text-slate-300 leading-relaxed text-xs">Squarified treemap showing area proportional to place count per category. Zoomable and pannable.</p>
                    </div>
                    <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div class="text-rose-300 font-bold mb-1">〜 Arc Diagram</div>
                        <p class="text-slate-300 leading-relaxed text-xs">Linear baseline with curved arcs connecting consecutive stops. Hover highlights connected arcs.</p>
                    </div>
                    <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div class="text-pink-300 font-bold mb-1">🫧 Bubble Cluster</div>
                        <p class="text-slate-300 leading-relaxed text-xs">Circle packing layout grouping places inside category bubbles. Fully zoomable and pannable.</p>
                    </div>
                    <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                        <div class="text-orange-300 font-bold mb-1">📊 Bar / 📈 Line</div>
                        <p class="text-slate-300 leading-relaxed text-xs">D3 bar chart for category counts. Line chart with gradient fill for daily distance progression.</p>
                    </div>
                </div>
                <p class="text-slate-400 text-xs mt-4">Routing algorithm: Nearest-neighbor greedy heuristic on GPS coordinates. Edges weighted by Haversine distance (km). Transport: Walk ≤ 2 km, Transit > 2 km.</p>
            </div>
        `;

        // ── Render D3 Donut Chart ──
        this._renderDonut(uniqueCats);
        // ── Render D3 Area Chart ──
        this._renderAreaChart(kmPerDay);
    },

    _renderDonut(catCounts) {
        const el = document.getElementById('stats-donut');
        if (!el) return;
        const W = el.clientWidth || 300;
        const H = el.clientHeight || 220;
        const R = Math.min(W, H) / 2 - 10;

        const data = Object.entries(catCounts).map(([cat, count]) => ({ cat, count }))
            .sort((a, b) => b.count - a.count);
        const total = data.reduce((s, d) => s + d.count, 0);

        const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
        const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`);

        const pie = d3.pie().value(d => d.count).sort(null).padAngle(0.03);
        const arc = d3.arc().innerRadius(R * 0.55).outerRadius(R);
        const arcHover = d3.arc().innerRadius(R * 0.55).outerRadius(R + 8);

        const arcs = g.selectAll('.arc').data(pie(data)).enter().append('g');
        arcs.append('path')
            .attr('d', arc)
            .attr('fill', d => this.colors[d.data.cat] || '#94a3b8')
            .attr('stroke', '#fff').attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                d3.select(this).transition().duration(150).attr('d', arcHover);
            })
            .on('mouseout', function(event, d) {
                d3.select(this).transition().duration(150).attr('d', arc);
            })
            .append('title').text(d => `${d.data.cat}: ${d.data.count} (${Math.round(d.data.count/total*100)}%)`);

        // Labels
        arcs.filter(d => d.data.count / total > 0.08).append('text')
            .attr('transform', d => `translate(${arc.centroid(d)})`)
            .attr('text-anchor', 'middle').attr('dy', '0.35em')
            .style('font-size', '10px').style('font-weight', '700').style('fill', '#fff')
            .style('font-family', this._font).style('pointer-events', 'none')
            .text(d => d.data.count);

        // Center text
        g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.2em')
            .style('font-size', '28px').style('font-weight', '900').style('fill', '#1e293b')
            .style('font-family', this._font).text(total);
        g.append('text').attr('text-anchor', 'middle').attr('dy', '1.2em')
            .style('font-size', '11px').style('fill', '#94a3b8').style('font-weight', '600')
            .style('font-family', this._font).text('places');
    },

    _renderAreaChart(kmPerDay) {
        const el = document.getElementById('stats-area');
        if (!el) return;
        const W = el.clientWidth || 300;
        const H = el.clientHeight || 220;
        const margin = { t: 10, r: 20, b: 30, l: 40 };
        const iW = W - margin.l - margin.r, iH = H - margin.t - margin.b;

        const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
        const g = svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`);

        const x = d3.scalePoint().domain(kmPerDay.map(d => `Day ${d.day}`)).range([0, iW]).padding(0.3);
        const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(kmPerDay, d => d.km) * 1.2)]).range([iH, 0]);

        // Gradient
        const grad = svg.append('defs').append('linearGradient').attr('id', 'area-grad')
            .attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
        grad.append('stop').attr('offset', '0%').attr('stop-color', '#4f46e5').attr('stop-opacity', 0.3);
        grad.append('stop').attr('offset', '100%').attr('stop-color', '#4f46e5').attr('stop-opacity', 0);

        // X Axis
        g.append('g').attr('transform', `translate(0,${iH})`).call(d3.axisBottom(x).tickSize(0).tickPadding(8))
            .selectAll('text').style('font-size', '10px').style('font-family', this._font).style('fill', '#64748b');
        g.selectAll('.domain').attr('stroke', '#e2e8f0');

        // Y Axis
        g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-iW).tickFormat(d => d + ' km'))
            .selectAll('line').attr('stroke', '#f1f5f9');
        g.selectAll('.domain').remove();
        g.selectAll('text').style('font-size', '10px').style('font-family', this._font).style('fill', '#94a3b8');

        // Area
        const area = d3.area().x(d => x(`Day ${d.day}`)).y0(iH).y1(d => y(d.km)).curve(d3.curveMonotoneX);
        g.append('path').datum(kmPerDay).attr('fill', 'url(#area-grad)').attr('d', area);

        // Line
        const line = d3.line().x(d => x(`Day ${d.day}`)).y(d => y(d.km)).curve(d3.curveMonotoneX);
        g.append('path').datum(kmPerDay).attr('fill', 'none')
            .attr('stroke', '#4f46e5').attr('stroke-width', 3).attr('stroke-linecap', 'round').attr('d', line);

        // Dots
        g.selectAll('.dot').data(kmPerDay).enter().append('circle')
            .attr('cx', d => x(`Day ${d.day}`)).attr('cy', d => y(d.km))
            .attr('r', 4).attr('fill', '#fff').attr('stroke', '#4f46e5').attr('stroke-width', 2.5)
            .append('title').text(d => `Day ${d.day}: ${d.km} km`);
    },

    // ════════════════════════════════════════════
    // 5. RADIAL TREE — Animated, hover tooltip
    // ════════════════════════════════════════════
    renderRadialTree(nodesData, cityName) {
        const container = document.getElementById('view-radial');
        if (!container) return;
        container.innerHTML = '';
        const W = container.clientWidth || 800;
        const H = container.clientHeight || 600;
        const radius = Math.min(W, H) / 2 - 100;
        const tip = this._createTooltip(container);

        const byCat = {};
        nodesData.forEach(n => { const c = n.category || 'Attraction'; if (!byCat[c]) byCat[c] = []; byCat[c].push({ name: n.name }); });

        const root = d3.hierarchy({
            name: cityName || 'Destination',
            children: Object.entries(byCat).map(([cat, places]) => ({ name: cat, children: places }))
        });
        d3.cluster().size([2 * Math.PI, radius])(root);

        const svg = d3.select(container).append('svg')
            .attr('width', W).attr('height', H)
            .style('background', 'linear-gradient(135deg,#f8fafc,#eef2ff)')
            .style('cursor', 'grab');

        const g = svg.append('g').attr('transform', `translate(${W/2},${H/2})`);

        const zoom = d3.zoom().scaleExtent([0.3, 5])
            .on('zoom', e => { g.attr('transform', `translate(${W/2 + e.transform.x},${H/2 + e.transform.y}) scale(${e.transform.k})`); svg.style('cursor', 'grabbing'); })
            .on('end', () => svg.style('cursor', 'grab'));
        svg.call(zoom);

        // Links — animated
        g.selectAll('.rlink').data(root.links()).enter().append('path')
            .attr('fill', 'none')
            .attr('stroke', d => { let a = d.target; while (a.depth > 1) a = a.parent; return this.colors[a.data.name] || '#94a3b8'; })
            .attr('stroke-width', d => d.target.depth === 1 ? 2.5 : 1.5)
            .attr('stroke-opacity', 0)
            .attr('d', d3.linkRadial().angle(d => d.x).radius(d => d.y))
            .transition().duration(600).delay((d, i) => i * 10).attr('stroke-opacity', 0.6);

        // Nodes — animated
        const node = g.selectAll('.rnode').data(root.descendants()).enter().append('g')
            .attr('transform', d => `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y},0)`)
            .style('cursor', 'pointer');

        node.append('circle')
            .attr('r', 0)
            .attr('fill', d => d.depth === 0 ? '#4f46e5' : d.depth === 1 ? (this.colors[d.data.name] || '#94a3b8') : (this.colors[d.parent.data.name] || '#c7d2fe'))
            .attr('stroke', '#fff').attr('stroke-width', 2.5)
            .style('filter', d => d.depth < 2 ? 'drop-shadow(0 2px 5px rgba(0,0,0,0.2))' : 'none')
            .transition().duration(400).delay((d, i) => i * 15)
            .attr('r', d => d.depth === 0 ? 13 : d.depth === 1 ? 8 : 5);

        node.append('text')
            .attr('dy', '0.32em')
            .attr('x', d => d.x < Math.PI === !d.children ? 10 : -10)
            .attr('text-anchor', d => d.x < Math.PI === !d.children ? 'start' : 'end')
            .attr('transform', d => d.x >= Math.PI ? 'rotate(180)' : null)
            .style('font-size', d => d.depth === 0 ? '15px' : d.depth === 1 ? '12px' : '10px')
            .style('font-weight', d => d.depth < 2 ? '700' : '400')
            .style('fill', d => d.depth === 0 ? '#1e1b4b' : d.depth === 1 ? '#1e293b' : '#64748b')
            .style('font-family', this._font)
            .style('opacity', 0)
            .text(d => d.data.name.length > 22 ? d.data.name.slice(0, 20) + '…' : d.data.name)
            .transition().duration(400).delay((d, i) => 200 + i * 10).style('opacity', 1);

        // Hover tooltip for leaves
        node.filter(d => !d.children)
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget).select('circle').transition().duration(100).attr('r', 8);
                const cat = d.parent ? d.parent.data.name : '';
                this._showTooltip(tip, `<div class="tt-title">${d.data.name}</div><div class="tt-sub">${cat}</div>`, event);
            })
            .on('mouseout', (event) => {
                d3.select(event.currentTarget).select('circle').transition().duration(100).attr('r', 5);
                this._hideTooltip(tip);
            });

        this._addZoomHint(container);
    },

    // ════════════════════════════════════════════
    // 6. TIMELINE — Better styling + hover
    // ════════════════════════════════════════════
    renderTimeline(dailyPlan) {
        const container = document.getElementById('view-timeline');
        if (!container) return;

        const days = Object.entries(dailyPlan);
        const totalMins = 11 * 60;
        const hours = ['9am','10','11','12pm','1','2','3','4','5','6','7','8pm'];

        let html = `<div style="padding:28px 24px;font-family:'Inter',sans-serif;min-width:600px;max-width:900px;margin:0 auto;">
            <h2 style="font-size:22px;font-weight:800;color:#1e293b;margin-bottom:3px;">📅 Daily Timeline</h2>
            <p style="font-size:13px;color:#64748b;margin-bottom:24px;">Estimated schedule · 9 AM start · ~1.5 hrs per attraction</p>

            <div style="display:flex;margin-left:72px;margin-bottom:8px;padding-bottom:6px;">
                ${hours.map(h => `<div style="flex:1;font-size:10px;font-weight:700;color:#94a3b8;text-align:center;border-left:1px solid #f1f5f9;">${h}</div>`).join('')}
            </div>`;

        days.forEach(([day, places], di) => {
            const nonH = places.filter(p => p.category !== 'Hotel');
            const dayColor = this.dayColors[di % this.dayColors.length];
            const minsEach = nonH.length > 0 ? Math.min(totalMins / nonH.length, 110) : 90;

            html += `<div style="display:flex;align-items:center;margin-bottom:8px;gap:10px;">
                <div style="width:62px;text-align:right;font-size:13px;font-weight:700;color:${dayColor};flex-shrink:0;">Day ${day}</div>
                <div style="flex:1;background:white;border-radius:12px;height:48px;position:relative;border:1.5px solid #e2e8f0;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">`;

            nonH.forEach((place, idx) => {
                const startPct = (idx * minsEach / totalMins) * 100;
                const wPct = (minsEach / totalMins) * 100 - 0.5;
                const catColor = this.colors[place.category] || this.colors['Attraction'];
                const startTime = 9 * 60 + idx * minsEach;
                const hrs = Math.floor(startTime / 60);
                const mins = Math.round(startTime % 60);
                const timeStr = `${hrs > 12 ? hrs - 12 : hrs}:${String(mins).padStart(2, '0')} ${hrs >= 12 ? 'PM' : 'AM'}`;

                html += `<div title="${place.name}\n${place.category}\n${timeStr}" style="
                    position:absolute;left:${startPct}%;width:${wPct}%;top:4px;bottom:4px;
                    background:linear-gradient(135deg,${catColor},${catColor}dd);border-radius:8px;
                    display:flex;flex-direction:column;justify-content:center;padding:0 8px;overflow:hidden;cursor:default;
                    transition:all .2s;box-shadow:0 1px 3px ${catColor}40;
                " onmouseover="this.style.transform='scaleY(1.08)';this.style.zIndex='5'" onmouseout="this.style.transform='scaleY(1)';this.style.zIndex='1'">
                    <span style="font-size:10px;font-weight:700;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;">${place.name}</span>
                    <span style="font-size:8px;color:rgba(255,255,255,0.7);font-weight:600;">${timeStr}</span>
                </div>`;
            });
            html += `</div></div>`;
        });

        html += `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:20px;padding-top:16px;border-top:1.5px solid #e2e8f0;">
                ${Object.entries(this.colors).filter(([k]) => k !== 'Hotel').map(([cat, col]) =>
                    `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#374151;font-weight:600;">
                        <div style="width:12px;height:12px;border-radius:3px;background:${col};"></div>${cat}
                    </div>`
                ).join('')}
            </div>
        </div>`;
        container.innerHTML = html;
    },

    // ════════════════════════════════════════════
    // 7. TREEMAP — Animated entry, gradient fills
    // ════════════════════════════════════════════
    renderTreemap(nodesData, cityName) {
        const container = document.getElementById('view-treemap');
        if (!container) return;
        container.innerHTML = '';
        const W = container.clientWidth || 800;
        const H = container.clientHeight || 600;
        const tip = this._createTooltip(container);

        const byCat = {};
        nodesData.forEach(n => { const c = n.category || 'Attraction'; if (!byCat[c]) byCat[c] = []; byCat[c].push({ name: n.name, value: 1 }); });

        const root = d3.hierarchy({
            name: cityName || 'Destination',
            children: Object.entries(byCat).map(([cat, places]) => ({ name: cat, children: places }))
        }).sum(d => d.value || 0).sort((a, b) => b.value - a.value);

        d3.treemap().size([W, H]).padding(4).paddingTop(28).round(true)(root);

        const svg = d3.select(container).append('svg')
            .attr('width', W).attr('height', H).style('display', 'block').style('cursor', 'grab');

        const g = svg.append('g');
        const zoom = d3.zoom().scaleExtent([0.4, 8])
            .on('zoom', e => { g.attr('transform', e.transform); svg.style('cursor', 'grabbing'); })
            .on('end', () => svg.style('cursor', 'grab'));
        svg.call(zoom);

        // Category groups
        const cats = g.selectAll('.cat').data(root.children || []).enter().append('g');
        cats.append('rect')
            .attr('x', d => d.x0).attr('y', d => d.y0)
            .attr('width', d => d.x1 - d.x0).attr('height', d => d.y1 - d.y0)
            .attr('fill', d => this.colors[d.data.name] || '#94a3b8')
            .attr('fill-opacity', 0.1)
            .attr('stroke', d => this.colors[d.data.name] || '#94a3b8')
            .attr('stroke-width', 2).attr('rx', 8);
        cats.append('text')
            .attr('x', d => d.x0 + 10).attr('y', d => d.y0 + 19)
            .style('font-size', '12px').style('font-weight', '800')
            .style('fill', d => this.colors[d.data.name] || '#374151')
            .style('font-family', this._font)
            .text(d => `${d.data.name} (${d.children ? d.children.length : 0})`);

        // Leaves — animated entry
        const leaves = g.selectAll('.leaf').data(root.leaves()).enter().append('g')
            .attr('transform', d => `translate(${d.x0},${d.y0})`);

        leaves.append('rect')
            .attr('width', 0).attr('height', 0)
            .attr('fill', d => this.colors[d.parent.data.name] || '#94a3b8')
            .attr('fill-opacity', 0.8).attr('rx', 5)
            .style('cursor', 'pointer')
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget).attr('fill-opacity', 1);
                this._showTooltip(tip, `<div class="tt-title">${d.data.name}</div><div class="tt-sub">${d.parent.data.name}</div>`, event);
            })
            .on('mouseout', (event) => {
                d3.select(event.currentTarget).attr('fill-opacity', 0.8);
                this._hideTooltip(tip);
            })
            .transition().duration(600).delay((d, i) => i * 20)
            .attr('width', d => Math.max(0, d.x1 - d.x0 - 1))
            .attr('height', d => Math.max(0, d.y1 - d.y0 - 1));

        leaves.append('text')
            .attr('x', 6).attr('y', 16)
            .style('font-size', '10px').style('font-weight', '600')
            .style('fill', 'white').style('pointer-events', 'none')
            .style('font-family', this._font).style('opacity', 0)
            .text(d => {
                const w = d.x1 - d.x0;
                if (w < 28) return '';
                const name = d.data.name;
                return w < 70 ? name.slice(0, 6) + '…' : (name.length > 18 ? name.slice(0, 16) + '…' : name);
            })
            .transition().delay(600).duration(300).style('opacity', 1);

        this._addZoomHint(container);
    },

    // ════════════════════════════════════════════
    // 8. ARC DIAGRAM — Fixed zoom, animated arcs, hover highlight
    // ════════════════════════════════════════════
    renderArcDiagram(nodesData, edgesData) {
        const container = document.getElementById('view-arc');
        if (!container) return;
        container.innerHTML = '';
        const W = container.clientWidth || 800;
        const H = container.clientHeight || 600;
        const margin = { l: 50, r: 50, t: 70, b: 130 };
        const tip = this._createTooltip(container);

        const nodes = nodesData.filter(n => n.category !== 'Hotel');
        if (!nodes.length) return;

        const innerW = W - margin.l - margin.r;
        const step = nodes.length > 1 ? innerW / (nodes.length - 1) : 0;
        const nodeMap = {};
        nodes.forEach((n, i) => { n._x = i * step; nodeMap[n.id] = n; });
        const midY = (H - margin.t - margin.b) * 0.5;

        const svg = d3.select(container).append('svg')
            .attr('width', W).attr('height', H)
            .style('background', 'linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%)')
            .style('cursor', 'grab');

        // Fixed title
        svg.append('text').attr('x', W / 2).attr('y', 28).attr('text-anchor', 'middle')
            .style('font-size', '17px').style('font-weight', '800').style('fill', '#1e293b')
            .style('font-family', this._font).text('Arc Diagram — Route Connections');
        svg.append('text').attr('x', W / 2).attr('y', 46).attr('text-anchor', 'middle')
            .style('font-size', '11px').style('fill', '#94a3b8').style('font-family', this._font)
            .text('Hover nodes to highlight · Color = Day · Dashed = Walking');

        // Zoomable group — fixed zoom (no translate accumulation bug)
        const g = svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`);
        const zoom = d3.zoom().scaleExtent([0.3, 6])
            .on('zoom', e => { g.attr('transform', e.transform); svg.style('cursor', 'grabbing'); })
            .on('end', () => svg.style('cursor', 'grab'));
        svg.call(zoom);
        svg.call(zoom.transform, d3.zoomIdentity.translate(margin.l, margin.t));

        // Baseline
        g.append('line').attr('x1', 0).attr('y1', midY).attr('x2', innerW).attr('y2', midY)
            .attr('stroke', '#e2e8f0').attr('stroke-width', 2);

        // Arcs — animated drawing
        const arcPaths = [];
        edgesData.forEach(e => {
            const src = nodeMap[e.source], tgt = nodeMap[e.target];
            if (!src || !tgt) return;
            const dayNum = parseInt(e.day.replace('Day ', '')) || 1;
            const color = this.dayColors[(dayNum - 1) % this.dayColors.length];
            const x1 = src._x, x2 = tgt._x;
            const r = Math.abs(x2 - x1) / 2;
            const arcPath = g.append('path')
                .attr('d', `M${x1},${midY} A${r},${Math.max(r * 0.45, 20)} 0 0,${x2 >= x1 ? 1 : 0} ${x2},${midY}`)
                .attr('fill', 'none').attr('stroke', color)
                .attr('stroke-width', 2.5).attr('stroke-opacity', 0.7)
                .attr('stroke-dasharray', e.transport === 'Walk' ? '6,4' : null)
                .attr('data-src', e.source).attr('data-tgt', e.target);

            // Animated drawing
            const len = arcPath.node().getTotalLength();
            arcPath.attr('stroke-dasharray', len + ' ' + len)
                .attr('stroke-dashoffset', len)
                .transition().duration(800).delay(200)
                .attr('stroke-dashoffset', 0)
                .on('end', function() {
                    if (e.transport === 'Walk') d3.select(this).attr('stroke-dasharray', '6,4');
                    else d3.select(this).attr('stroke-dasharray', null);
                });

            arcPaths.push(arcPath);
        });

        // Nodes — with hover highlight
        nodes.forEach(n => {
            const color = this.colors[n.category] || this.colors['Attraction'];
            const circle = g.append('circle')
                .attr('cx', n._x).attr('cy', midY).attr('r', 9)
                .attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 2.5)
                .style('filter', 'drop-shadow(0 2px 5px rgba(0,0,0,0.2))')
                .style('cursor', 'pointer')
                .attr('data-id', n.id);

            circle.on('mouseover', (event) => {
                // Highlight connected arcs
                arcPaths.forEach(p => {
                    const s = p.attr('data-src'), t = p.attr('data-tgt');
                    if (s === n.id || t === n.id) {
                        p.attr('stroke-opacity', 1).attr('stroke-width', 4);
                    } else {
                        p.attr('stroke-opacity', 0.12);
                    }
                });
                d3.select(event.currentTarget).attr('r', 13);
                this._showTooltip(tip, `<div class="tt-title">${n.name}</div><div class="tt-sub">${n.category}</div>`, event);
            })
            .on('mouseout', (event) => {
                arcPaths.forEach(p => p.attr('stroke-opacity', 0.7).attr('stroke-width', 2.5));
                d3.select(event.currentTarget).attr('r', 9);
                this._hideTooltip(tip);
            });

            // Label
            g.append('text')
                .attr('x', n._x).attr('y', midY + 18)
                .attr('text-anchor', 'end')
                .attr('transform', `rotate(55,${n._x},${midY + 18})`)
                .style('font-size', '10px').style('font-weight', '500')
                .style('fill', '#475569').style('font-family', this._font)
                .text(n.name.length > 14 ? n.name.slice(0, 12) + '…' : n.name);
        });

        // Day legend
        const legendG = svg.append('g').attr('transform', `translate(${margin.l}, ${H - 24})`);
        const uniqueDays = [...new Set(edgesData.map(e => e.day))].sort();
        uniqueDays.forEach((day, i) => {
            const dayNum = parseInt(day.replace('Day ', '')) || (i + 1);
            const color = this.dayColors[(dayNum - 1) % this.dayColors.length];
            legendG.append('rect').attr('x', i * 95).attr('width', 12).attr('height', 12).attr('rx', 3).attr('fill', color);
            legendG.append('text').attr('x', i * 95 + 16).attr('y', 10)
                .style('font-size', '11px').style('fill', '#475569').style('font-weight', '600')
                .style('font-family', this._font).text(day);
        });
    },

    // ════════════════════════════════════════════
    // 9. BUBBLE CLUSTER — Tooltip, pulse center
    // ════════════════════════════════════════════
    renderCluster(nodesData, cityName) {
        const container = document.getElementById('view-cluster');
        if (!container) return;
        container.innerHTML = '';
        const W = container.clientWidth || 800;
        const H = container.clientHeight || 600;
        const tip = this._createTooltip(container);

        const byCat = {};
        nodesData.forEach(n => { const c = n.category || 'Attraction'; if (!byCat[c]) byCat[c] = []; byCat[c].push({ name: n.name, value: 1 }); });

        const root = d3.hierarchy({
            name: cityName || 'Destination',
            children: Object.entries(byCat).map(([cat, places]) => ({ name: cat, children: places }))
        }).sum(d => d.value).sort((a, b) => b.value - a.value);

        d3.pack().size([W, H]).padding(10)(root);

        const svg = d3.select(container).append('svg')
            .attr('width', W).attr('height', H).style('display', 'block')
            .style('background', 'linear-gradient(135deg, #f8fafc, #f0f4ff)')
            .style('cursor', 'grab');
        const g = svg.append('g');
        const zoom = d3.zoom().scaleExtent([0.5, 8])
            .on('zoom', e => { g.attr('transform', e.transform); svg.style('cursor', 'grabbing'); })
            .on('end', () => svg.style('cursor', 'grab'));
        svg.call(zoom);

        const node = g.selectAll('g').data(root.descendants()).enter().append('g')
            .attr('transform', d => `translate(${d.x},${d.y})`);

        // Circles — animated
        node.append('circle')
            .attr('r', 0)
            .attr('fill', d => d.depth === 0 ? '#eef2ff' : d.depth === 1 ? (this.colors[d.data.name] || '#cbd5e1') : (this.colors[d.parent.data.name] || '#94a3b8'))
            .attr('fill-opacity', d => d.depth === 0 ? 1 : d.depth === 1 ? 0.12 : 0.8)
            .attr('stroke', d => d.depth === 0 ? '#c7d2fe' : d.depth === 1 ? (this.colors[d.data.name] || '#cbd5e1') : '#fff')
            .attr('stroke-width', d => d.depth === 2 ? 1.5 : 2)
            .style('cursor', d => d.depth === 2 ? 'pointer' : 'default')
            .transition().duration(600).delay((d, i) => i * 10)
            .attr('r', d => d.r);

        // Tooltip on leaf hover
        node.filter(d => d.depth === 2)
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget).select('circle').transition().duration(100).attr('fill-opacity', 1).attr('stroke-width', 3);
                this._showTooltip(tip, `<div class="tt-title">${d.data.name}</div><div class="tt-sub">${d.parent.data.name}</div>`, event);
            })
            .on('mouseout', (event) => {
                d3.select(event.currentTarget).select('circle').transition().duration(100).attr('fill-opacity', 0.8).attr('stroke-width', 1.5);
                this._hideTooltip(tip);
            });

        // Leaf labels
        node.filter(d => !d.children && d.r > 14).append('text')
            .attr('dy', '0.3em').style('text-anchor', 'middle')
            .style('font-size', d => Math.min(11, d.r / 2.5) + 'px').style('fill', '#fff')
            .style('pointer-events', 'none').style('font-family', this._font).style('font-weight', '600')
            .text(d => d.data.name.substring(0, Math.floor(d.r / 3)) + (d.data.name.length > d.r / 3 ? '…' : ''));

        // Category labels
        node.filter(d => d.depth === 1 && d.r > 24).append('text')
            .attr('dy', d => -d.r + 16).style('text-anchor', 'middle')
            .style('font-size', '13px').style('font-weight', '800')
            .style('fill', d => this.colors[d.data.name] || '#374151')
            .style('pointer-events', 'none').style('font-family', this._font)
            .text(d => d.data.name);

        this._addZoomHint(container);
    },

    // ════════════════════════════════════════════
    // 10. BAR CHART — Fixed animation, hover tooltips
    // ════════════════════════════════════════════
    renderBarChart(nodesData) {
        const container = document.getElementById('view-bar');
        if (!container) return;
        container.innerHTML = '';
        const W = container.clientWidth || 800;
        const H = container.clientHeight || 600;
        const margin = { t: 60, r: 60, b: 40, l: 140 };
        const innerW = W - margin.l - margin.r;
        const innerH = H - margin.t - margin.b;
        const tip = this._createTooltip(container);

        const counts = {};
        nodesData.forEach(n => {
            if (n.category === 'Hotel') return;
            const c = n.category || 'Attraction';
            counts[c] = (counts[c] || 0) + 1;
        });
        const data = Object.entries(counts).map(([cat, count]) => ({ cat, count })).sort((a, b) => b.count - a.count);
        const total = data.reduce((s, d) => s + d.count, 0);
        if (!data.length) return;

        const svg = d3.select(container).append('svg').attr('width', W).attr('height', H)
            .style('background', 'white');
        const g = svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`);

        const x = d3.scaleLinear().domain([0, d3.max(data, d => d.count) * 1.15]).range([0, innerW]);
        const y = d3.scaleBand().domain(data.map(d => d.cat)).range([0, innerH]).padding(0.28);

        // Grid lines
        g.append('g').call(d3.axisBottom(x).ticks(5).tickSize(-innerH).tickFormat(d => Number.isInteger(d) ? d : ''))
            .attr('transform', `translate(0,${innerH})`)
            .call(g2 => { g2.selectAll('line').attr('stroke', '#f1f5f9'); g2.selectAll('.domain').remove(); g2.selectAll('text').remove(); });

        // Bars — properly scoped animation (NOT targeting grid rects)
        const bars = g.selectAll('.bar-rect').data(data).enter().append('rect')
            .attr('class', 'bar-rect')
            .attr('y', d => y(d.cat)).attr('height', y.bandwidth())
            .attr('x', 0).attr('width', 0)
            .attr('fill', d => this.colors[d.cat] || '#94a3b8')
            .attr('rx', 6)
            .style('cursor', 'pointer');

        bars.transition().duration(800).delay((d, i) => i * 80)
            .attr('width', d => x(d.count));

        // Hover
        bars.on('mouseover', (event, d) => {
                d3.select(event.currentTarget).attr('fill-opacity', 0.85);
                const pct = Math.round(d.count / total * 100);
                this._showTooltip(tip, `<div class="tt-title">${d.cat}</div><div class="tt-sub">${d.count} places · ${pct}% of total</div>`, event);
            })
            .on('mouseout', (event) => {
                d3.select(event.currentTarget).attr('fill-opacity', 1);
                this._hideTooltip(tip);
            });

        // Y Axis Labels
        g.append('g').call(d3.axisLeft(y).tickSize(0)).selectAll('text')
            .style('font-size', '13px').style('font-weight', '600')
            .style('font-family', this._font).style('fill', '#374151').attr('dx', '-8');
        g.selectAll('.domain').remove();

        // Data Labels
        g.selectAll('.bar-label').data(data).enter().append('text')
            .attr('class', 'bar-label')
            .attr('y', d => y(d.cat) + y.bandwidth() / 2 + 5)
            .attr('x', d => x(d.count) + 10).style('opacity', 0)
            .style('font-size', '14px').style('font-weight', '800').style('fill', '#1e293b')
            .style('font-family', this._font)
            .text(d => d.count)
            .transition().delay(800).duration(400).style('opacity', 1);

        // Title
        svg.append('text').attr('x', W / 2).attr('y', 34).attr('text-anchor', 'middle')
            .style('font-size', '19px').style('font-weight', '800').style('fill', '#1e293b')
            .style('font-family', this._font).text('📊 Places by Category');
    },

    // ════════════════════════════════════════════
    // 11. LINE CHART — Gradient area, animated, hover crosshair
    // ════════════════════════════════════════════
    renderLineChart(dailyPlan, edgesData) {
        const container = document.getElementById('view-line');
        if (!container) return;
        container.innerHTML = '';
        const W = container.clientWidth || 800;
        const H = container.clientHeight || 600;
        const margin = { t: 70, r: 60, b: 60, l: 80 };
        const innerW = W - margin.l - margin.r;
        const innerH = H - margin.t - margin.b;

        const dayDist = {};
        edgesData.forEach(e => { dayDist[e.day] = (dayDist[e.day] || 0) + (parseFloat(e.distance) || 0); });

        const data = Object.keys(dailyPlan).map(day => ({
            day: `Day ${day}`,
            dist: dayDist[`Day ${day}`] || 0,
            places: dailyPlan[day].filter(p => p.category !== 'Hotel').length
        }));
        if (!data.length) return;

        const svg = d3.select(container).append('svg').attr('width', W).attr('height', H)
            .style('background', 'white');
        const defs = svg.append('defs');

        // Gradient
        const grad = defs.append('linearGradient').attr('id', 'line-area-grad')
            .attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
        grad.append('stop').attr('offset', '0%').attr('stop-color', '#4f46e5').attr('stop-opacity', 0.25);
        grad.append('stop').attr('offset', '100%').attr('stop-color', '#4f46e5').attr('stop-opacity', 0);

        const g = svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`);

        const x = d3.scalePoint().domain(data.map(d => d.day)).range([0, innerW]).padding(0.4);
        const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(data, d => d.dist)) * 1.25]).range([innerH, 0]);

        // Grid
        g.append('g').call(d3.axisLeft(y).tickSize(-innerW).ticks(5).tickFormat(d => d + ' km'))
            .call(g2 => { g2.selectAll('line').attr('stroke', '#f1f5f9'); g2.selectAll('.domain').remove(); })
            .selectAll('text').style('font-size', '11px').style('font-family', this._font).style('fill', '#94a3b8');

        // X Axis
        g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).tickSize(0).tickPadding(14))
            .call(g2 => g2.select('.domain').attr('stroke', '#e2e8f0').attr('stroke-width', 1.5))
            .selectAll('text').style('font-size', '13px').style('font-weight', '700')
            .style('font-family', this._font).style('fill', '#475569');

        // Area fill
        const area = d3.area().x(d => x(d.day)).y0(innerH).y1(d => y(d.dist)).curve(d3.curveMonotoneX);
        g.append('path').datum(data).attr('fill', 'url(#line-area-grad)').attr('d', area);

        // Line — animated drawing
        const line = d3.line().x(d => x(d.day)).y(d => y(d.dist)).curve(d3.curveMonotoneX);
        const linePath = g.append('path').datum(data)
            .attr('fill', 'none').attr('stroke', '#4f46e5').attr('stroke-width', 4)
            .attr('stroke-linecap', 'round').attr('d', line);
        const totalLen = linePath.node().getTotalLength();
        linePath.attr('stroke-dasharray', totalLen).attr('stroke-dashoffset', totalLen)
            .transition().duration(1200).ease(d3.easeQuadOut).attr('stroke-dashoffset', 0);

        // Points — animated
        const points = g.selectAll('.pt').data(data).enter().append('g')
            .attr('transform', d => `translate(${x(d.day)},${y(d.dist)})`);

        points.append('circle')
            .attr('r', 0).attr('fill', '#fff').attr('stroke', '#4f46e5').attr('stroke-width', 3)
            .transition().delay(1000).duration(300).attr('r', 7);

        points.append('text').attr('y', -18).attr('text-anchor', 'middle')
            .style('font-size', '12px').style('font-weight', '700').style('fill', '#1e293b')
            .style('font-family', this._font).style('opacity', 0)
            .text(d => `${d.dist.toFixed(1)} km`)
            .transition().delay(1200).duration(300).style('opacity', 1);

        // Hover crosshair
        const hoverLine = g.append('line')
            .attr('y1', 0).attr('y2', innerH)
            .attr('stroke', '#4f46e5').attr('stroke-width', 1).attr('stroke-dasharray', '4,4')
            .style('opacity', 0);
        const hoverDot = g.append('circle').attr('r', 5).attr('fill', '#4f46e5').style('opacity', 0);

        svg.append('rect').attr('x', margin.l).attr('y', margin.t)
            .attr('width', innerW).attr('height', innerH)
            .attr('fill', 'transparent').style('cursor', 'crosshair')
            .on('mousemove', (event) => {
                const [mx] = d3.pointer(event, g.node());
                let closest = data[0], minD = Infinity;
                data.forEach(d => { const dx = Math.abs(x(d.day) - mx); if (dx < minD) { minD = dx; closest = d; } });
                hoverLine.attr('x1', x(closest.day)).attr('x2', x(closest.day)).style('opacity', 0.5);
                hoverDot.attr('cx', x(closest.day)).attr('cy', y(closest.dist)).style('opacity', 1);
            })
            .on('mouseleave', () => { hoverLine.style('opacity', 0); hoverDot.style('opacity', 0); });

        // Title
        svg.append('text').attr('x', W / 2).attr('y', 36).attr('text-anchor', 'middle')
            .style('font-size', '19px').style('font-weight', '800').style('fill', '#1e293b')
            .style('font-family', this._font).text('📈 Daily Travel Distance');

        // Y-axis label
        svg.append('text').attr('transform', 'rotate(-90)').attr('x', -(margin.t + innerH / 2)).attr('y', 22)
            .attr('text-anchor', 'middle').style('font-size', '11px').style('font-weight', '600').style('fill', '#94a3b8')
            .style('font-family', this._font).text('Total Distance (km)');
    },

    // ════════════════════════════════════════════
    // SHARED: Zoom Hint Badge
    // ════════════════════════════════════════════
    _addZoomHint(container) {
        const hint = document.createElement('div');
        hint.style.cssText = `
            position:absolute;top:12px;right:12px;
            background:rgba(79,70,229,0.88);color:#fff;
            padding:7px 16px;border-radius:20px;font-size:12px;
            pointer-events:none;font-family:'Inter',sans-serif;
            font-weight:600;transition:opacity 1.5s;z-index:10;
            box-shadow:0 4px 12px rgba(79,70,229,0.3);
        `;
        hint.textContent = '🖱️ Scroll = Zoom · Drag = Pan';
        container.appendChild(hint);
        setTimeout(() => { hint.style.opacity = '0'; }, 4000);
    }
};

window.Visualizations = Visualizations;
