/**
 * app.js - Main orchestrator: UI flow, state, events, toasts, export
 */

document.addEventListener('DOMContentLoaded', () => {

    // ─── State ───────────────────────────────────────────────────────
    const tripData = {
        country: '', city: '', interests: [], days: 3, hotel: '',
        baseLocation: null,
        result: null  // { nodes, edges, dailyPlan }
    };
    let activeDayKey = null;

    // ─── Screen references ────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const sWelcome  = $('screen-welcome');
    const sWizard   = $('screen-wizard');
    const sLoading  = $('screen-loading');
    const sDashboard= $('screen-dashboard');

    // ─── Toast System ────────────────────────────────────────────────
    function toast(msg, type = 'info', duration = 3500) {
        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
        const tc = $('toast-container');
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
        tc.appendChild(el);
        setTimeout(() => {
            el.classList.add('toast-out');
            setTimeout(() => el.remove(), 350);
        }, duration);
    }

    // ─── Particle Generator ───────────────────────────────────────────
    (function spawnParticles() {
        const container = $('particles');
        if (!container) return;
        for (let i = 0; i < 40; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = `${Math.random() * 100}%`;
            p.style.width = p.style.height = `${2 + Math.random() * 4}px`;
            p.style.animationDuration = `${6 + Math.random() * 14}s`;
            p.style.animationDelay = `${Math.random() * 10}s`;
            container.appendChild(p);
        }
    })();

    // ─── Init: Load countries ─────────────────────────────────────────
    async function init() {
        const cl = $('country-list');
        const countries = await window.API.getCountries();
        cl.innerHTML = '';
        countries.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name.common;
            cl.appendChild(opt);
        });
    }
    init();

    // ─── Screen transitions ───────────────────────────────────────────
    function showScreen(screenEl) {
        [sWelcome, sWizard, sLoading, sDashboard].forEach(s => {
            s.classList.add('hidden');
        });
        screenEl.classList.remove('hidden');
    }

    // ─── Welcome → Wizard ─────────────────────────────────────────────
    $('btn-start').addEventListener('click', () => {
        sWelcome.style.opacity = '0';
        sWelcome.style.transition = 'opacity 0.5s ease';
        setTimeout(() => showScreen(sWizard), 450);
    });

    // ─── Day range slider ─────────────────────────────────────────────
    $('input-days-range').addEventListener('input', function() {
        $('days-display').textContent = this.value;
        $('input-days').value = this.value;
    });

    // ─── Step Navigation ─────────────────────────────────────────────
    function goToStep(from, to) {
        $(from).classList.add('hidden');
        $(to).classList.remove('hidden');

        // Update step indicators
        const done  = { '1': 'step-1', '2': 'step-2', '3': 'step-3' };
        const steps = document.querySelectorAll('.step-indicator');
        const lines = document.querySelectorAll('.step-line');
        const stepNum = parseInt(to.split('-')[1]);

        steps.forEach((s, i) => {
            s.classList.remove('active', 'done');
            if (i + 1 < stepNum) { s.classList.add('done'); }
            if (i + 1 === stepNum) { s.classList.add('active'); }
        });
        lines.forEach((l, i) => {
            l.classList.toggle('done', i < stepNum - 1);
        });
    }

    $('btn-next-1').addEventListener('click', () => {
        const country = $('input-country').value.trim();
        const city    = $('input-city').value.trim();
        if (!country || !city) { toast('Please fill in both Country and City.', 'warning'); return; }
        tripData.country = country;
        tripData.city    = city;
        goToStep('step-1', 'step-2');
    });

    $('btn-prev-2').addEventListener('click', () => goToStep('step-2', 'step-1'));

    $('btn-next-2').addEventListener('click', () => {
        const checked = [...document.querySelectorAll('#screen-wizard input[type="checkbox"]:checked')];
        if (checked.length === 0) { toast('Pick at least one interest!', 'warning'); return; }
        tripData.interests = checked.map(cb => cb.value);
        goToStep('step-2', 'step-3');
    });

    $('btn-prev-3').addEventListener('click', () => goToStep('step-3', 'step-2'));

    $('btn-generate').addEventListener('click', async () => {
        tripData.days  = parseInt($('input-days').value) || 3;
        tripData.hotel = $('input-hotel').value.trim();

        showScreen(sLoading);
        try {
            await processTrip();
        } catch (err) {
            console.error(err);
            toast('Something went wrong: ' + err.message, 'error', 6000);
            showScreen(sWizard);
        }
    });

    // ─── Loading helpers ──────────────────────────────────────────────
    function setStep(stepIdx, title, sub, progress) {
        $('loading-title').textContent = title;
        $('loading-subtitle').textContent = sub;
        $('loading-progress').style.width = `${progress}%`;

        for (let i = 1; i <= 4; i++) {
            const el = $(`lstep-${i}`);
            const ic = el.querySelector('.ls-icon');
            el.classList.remove('done', 'active');
            ic.classList.remove('done', 'active', 'pending');
            if (i < stepIdx) {
                el.classList.add('done');
                ic.classList.add('done');
                ic.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            } else if (i === stepIdx) {
                el.classList.add('active');
                ic.classList.add('active');
                ic.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            } else {
                ic.classList.add('pending');
                ic.innerHTML = '<i class="fa-regular fa-circle-dot"></i>';
            }
        }
    }

    // ─── Core trip generation ─────────────────────────────────────────
    async function processTrip() {
        const query = tripData.hotel
            ? `${tripData.hotel}, ${tripData.city}, ${tripData.country}`
            : `${tripData.city}, ${tripData.country}`;

        // Step 1
        setStep(1, '📍 Locating Destination', 'Converting city name to GPS coordinates...', 10);
        tripData.baseLocation = await window.API.geocode(query);
        if (!tripData.baseLocation) throw new Error('Could not geocode the location.');

        // Step 2
        setStep(2, '🌍 Fetching Real Places', 'Searching Wikipedia for tourist attractions...', 30);
        const pois = await window.API.getPOIs(
            tripData.baseLocation.lat, tripData.baseLocation.lon,
            8000, tripData.interests
        );
        if (!pois || pois.length === 0) throw new Error('No places found for this destination.');
        toast(`Found ${pois.length} real places!`, 'success');

        // Step 3
        setStep(3, '🗺️ Building Route Graph', 'Clustering locations and generating daily itinerary...', 60);
        const hotelNode = tripData.hotel ? { ...tripData.baseLocation, name: tripData.hotel } : null;
        const result = window.Planner.generateItinerary(pois, tripData.days, hotelNode);
        tripData.result = result;
        await delay(400);

        // Step 4
        setStep(4, '🎨 Rendering Visualizations', 'Drawing maps, graphs, and charts...', 85);
        await delay(300);

        // Render dashboard
        renderDashboard(result);
        $('loading-progress').style.width = '100%';

        await delay(400);
        showScreen(sDashboard);
        toast('Your trip is ready! 🎉', 'success');

        // Force map to recalculate size
        setTimeout(() => {
            if (window.Visualizations.map) window.Visualizations.map.invalidateSize();
        }, 400);
    }

    // ─── Render Dashboard ─────────────────────────────────────────────
    function renderDashboard(result) {
        const { nodes, edges, dailyPlan } = result;

        // Update header
        $('dash-title').textContent = `Trip to ${tripData.city}`;

        // Compute stats
        const nonHotelNodes = nodes.filter(n => n.category !== 'Hotel');
        const uniqueCats = [...new Set(nonHotelNodes.map(n => n.category))];
        const totalKm = edges.reduce((sum, e) => sum + parseFloat(e.distance || 0), 0);

        $('stat-places').textContent = nonHotelNodes.length;
        $('stat-days').textContent = tripData.days;
        $('stat-cats').textContent = uniqueCats.length;
        $('stat-km').textContent = totalKm.toFixed(1);
        $('dash-meta').textContent = `${tripData.days} days · ${nonHotelNodes.length} places · ${uniqueCats.length} categories`;

        // Build day tabs
        buildDayTabs(dailyPlan);

        // Show first day
        const firstDay = Object.keys(dailyPlan)[0];
        activeDayKey = firstDay;
        renderDayItinerary(dailyPlan[firstDay]);

        // Render all visualizations
        // Store data for lazy rendering (tabs render on first click)
        window.Visualizations._tripData = {
            nodes, edges, dailyPlan,
            city: tripData.city,
            days: tripData.days
        };
        window.Visualizations._rendered = new Set();

        // Render the first two (always-visible) tabs immediately
        window.Visualizations.renderMap(nodes, edges, tripData.baseLocation.lat, tripData.baseLocation.lon);
        window.Visualizations._rendered.add('view-map');
        window.Visualizations.renderNetwork(nodes, edges);
        window.Visualizations._rendered.add('view-network');

        // Build map day-filter buttons
        const dayFilterEl = document.getElementById('map-day-filter');
        if (dayFilterEl) {
            dayFilterEl.style.display = 'flex';
            let html = '<button class="day-filter-btn active" data-day="all" style="background:rgba(30,41,59,0.75);">All</button>';
            Object.keys(dailyPlan).forEach(day => {
                const di = parseInt(day) - 1;
                const color = window.Visualizations.dayColors[di % window.Visualizations.dayColors.length];
                html += `<button class="day-filter-btn" data-day="${day}" style="background:${color};">${'Day ' + day}</button>`;
            });
            dayFilterEl.innerHTML = html;
            dayFilterEl.querySelectorAll('.day-filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    dayFilterEl.querySelectorAll('.day-filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const day = btn.getAttribute('data-day');
                    window.Visualizations.filterMapByDay(day);
                });
            });
        }

        // "Open Full Route" button
        const allPois = nonHotelNodes;
        const url = window.API.getGoogleMapsRouteUrl(allPois.slice(0, 10));
        if (url) $('btn-maps-all').onclick = () => window.open(url, '_blank');
    }

    // ─── Day tabs ─────────────────────────────────────────────────────
    function buildDayTabs(dailyPlan) {
        const container = $('day-tabs');
        container.innerHTML = '';
        Object.keys(dailyPlan).forEach(day => {
            const btn = document.createElement('button');
            btn.className = 'day-tab' + (day === activeDayKey ? ' active' : '');
            btn.textContent = `Day ${day}`;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.day-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeDayKey = day;
                renderDayItinerary(dailyPlan[day]);
            });
            container.appendChild(btn);
        });
    }

    // ─── Render one day's itinerary ───────────────────────────────────
    function renderDayItinerary(locations) {
        const container = $('itinerary-container');
        container.innerHTML = '';
        if (!locations || locations.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-400 p-4 text-center">No places for this day.</p>';
            return;
        }

        const colors = window.Visualizations.colors;
        const emojis = {
            'Museum':'🏛️','Park':'🌳','Restaurant':'🍽️','Historic Site':'🏰',
            'Shopping':'🛍️','Viewpoint':'📸','Nature':'🌊','Religious Site':'🕌',
            'Hotel':'🏨','Attraction':'⭐'
        };

        // Google Maps button for this day
        const mapsUrl = window.API.getGoogleMapsRouteUrl(locations);
        if (mapsUrl) {
            const mapsBtn = document.createElement('a');
            mapsBtn.href = mapsUrl;
            mapsBtn.target = '_blank';
            mapsBtn.className = 'btn-maps w-full mb-3 no-underline';
            mapsBtn.innerHTML = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg> Open Day Route in Google Maps`;
            container.appendChild(mapsBtn);
        }

        locations.forEach((loc, idx) => {
            if (loc.category === 'Hotel' && idx === 0) return; // skip hotel if it's the start marker
            const color = colors[loc.category] || colors['Attraction'];
            const emoji = emojis[loc.category] || '📍';

            const card = document.createElement('div');
            card.className = 'place-card';
            card.innerHTML = `
                <div class="place-num" style="background:${color}">${idx + 1}</div>
                <div class="place-info">
                    <div class="place-name" title="${loc.name}">${emoji} ${loc.name}</div>
                    <span class="place-cat-badge" style="background:${color}">${loc.category}</span>
                    ${loc.summary ? `<p class="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">${loc.summary}</p>` : ''}
                    ${loc.wikiUrl ? `<a class="place-wiki" href="${loc.wikiUrl}" target="_blank">Learn more on Wikipedia →</a>` : ''}
                </div>
            `;

            // Click: bounce to this marker on map
            card.addEventListener('click', () => {
                if (window.Visualizations.map && loc.lat) {
                    const visTabs = document.querySelectorAll('.viz-tab');
                    const visViews = document.querySelectorAll('.viz-view');
                    visTabs.forEach(t => t.classList.remove('active'));
                    visViews.forEach(v => v.classList.add('hidden'));
                    document.querySelector('[data-target="view-map"]').classList.add('active');
                    $('view-map').classList.remove('hidden');
                    window.Visualizations.map.setView([loc.lat, loc.lon], 16, { animate: true });
                    window.Visualizations.bounceMarker(loc.id);
                    updateExplainer('view-map');
                }
            });

            container.appendChild(card);
        });
    }

    // ─── Visualization tab switching ──────────────────────────────────
    const vizTabs  = document.querySelectorAll('.viz-tab');
    const vizViews = document.querySelectorAll('.viz-view');

    function updateExplainer(targetId) {
        const explainers = {
            'view-map':        'GIS Map — Real GPS coordinates with animated routes · Click markers for info · Day filter to isolate routes',
            'view-network':    'Force-Directed Graph — Directed edges show travel sequence · Edge thickness = distance · Drag nodes to rearrange',
            'view-dendrogram': 'Dendrogram — City → Category → Place hierarchy · Click categories to collapse · Scroll = zoom · Drag = pan',
            'view-radial':     'Radial Tree — Circular sunburst hierarchy · Hover nodes for details · Scroll = zoom · Drag = pan',
            'view-timeline':   'Timeline — Gantt chart of daily schedule (9 AM – 8 PM) · Hover blocks for place details · Color = category',
            'view-treemap':    'Treemap — Nested rectangles sized by count · Hover for details · Scroll = zoom · Drag = pan',
            'view-arc':        'Arc Diagram — Linear node layout with curved arcs · Color = day · Dashed = walking · Hover to highlight',
            'view-cluster':    'Bubble Cluster — Circle packing by category · Drag bubbles · Scroll = zoom · Hover for details',
            'view-bar':        'Bar Graph — Places per category with hover tooltips · Animated entry',
            'view-line':       'Line Graph — Daily travel distance with gradient fill · Hover for crosshair tooltip',
            'view-stats':      'Stats & Analysis — D3 donut chart, area chart, KPI cards, and graph algorithm explainer'
        };
        const el = $('viz-explainer-text');
        if (el) el.textContent = explainers[targetId] || '';
    }

    vizTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            vizTabs.forEach(t => t.classList.remove('active'));
            vizViews.forEach(v => v.classList.add('hidden'));
            tab.classList.add('active');
            const target = tab.getAttribute('data-target');
            $(target).classList.remove('hidden');
            updateExplainer(target);

            // Lazy render: render this graph only on first visit
            const V = window.Visualizations;
            const D = V._tripData;
            if (D && V._rendered && !V._rendered.has(target)) {
                V._rendered.add(target);
                switch (target) {
                    case 'view-dendrogram': V.renderDendrogram(D.nodes, D.city); break;
                    case 'view-radial':     V.renderRadialTree(D.nodes, D.city); break;
                    case 'view-timeline':   V.renderTimeline(D.dailyPlan); break;
                    case 'view-treemap':    V.renderTreemap(D.nodes, D.city); break;
                    case 'view-arc':        V.renderArcDiagram(D.nodes, D.edges); break;
                    case 'view-cluster':    V.renderCluster(D.nodes, D.city); break;
                    case 'view-bar':        V.renderBarChart(D.nodes); break;
                    case 'view-line':       V.renderLineChart(D.dailyPlan, D.edges); break;
                    case 'view-stats':      V.renderStats(D.nodes, D.edges, D.dailyPlan, D.city, D.days); break;
                }
            }

            // Redraw if needed
            if (target === 'view-map' && V.map) {
                setTimeout(() => V.map.invalidateSize(), 100);
            } else if (target === 'view-network' && V.network) {
                setTimeout(() => V.network.redraw(), 100);
            }
        });
    });

    // Dark mode toggle
    $('btn-darkmode').addEventListener('click', () => {
        document.body.classList.toggle('dark');
        const icon = $('darkmode-icon');
        const isDark = document.body.classList.contains('dark');
        icon.className = isDark ? 'fa-solid fa-sun mr-1' : 'fa-solid fa-moon mr-1';
        $('btn-darkmode').querySelector('i').nextSibling.textContent = isDark ? ' Light' : ' Dark';
        // Save preference
        localStorage.setItem('darkMode', isDark ? '1' : '0');
    });
    // Restore dark mode preference
    if (localStorage.getItem('darkMode') === '1') {
        document.body.classList.add('dark');
        const icon = $('darkmode-icon');
        if (icon) { icon.className = 'fa-solid fa-sun mr-1'; }
    }

    // ─── Export / Print ───────────────────────────────────────────────
    $('btn-export').addEventListener('click', () => {
        if (!tripData.result) { toast('Generate a trip first!', 'warning'); return; }
        window.print();
    });

    // ─── Restart ──────────────────────────────────────────────────────
    $('btn-restart').addEventListener('click', () => location.reload());

    // ─── Utilities ───────────────────────────────────────────────────
    function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

});
