import {
    selectHealthyTrafficNode,
} from '../lib/speedMetrics';

// -----------------------------------------------------------------------
// Balanced (Default) Strategy — mirrors original behavior
// -----------------------------------------------------------------------
export const balancedStrategy = {
    id: 'balanced',
    label: 'Default (Balanced)',
    description: 'Round-robin across all healthy nodes with concurrent latency sweep every second.',
    hasLatencySweep: true,
    connectionRotationMs: 2000, // restore original 2s forced rotation
    useJitter: false,          // restore original fixed 1s intervals
    throttleWorkerStats: false, // restore original every-1s table updates
    configFields: [],

    initialize(nodes) {
        return { nodes };
    },

    selectNode({ strategyState, nodeStatsRef, nodeCursorRef, now }) {
        return selectHealthyTrafficNode(
            strategyState.nodes,
            nodeStatsRef.current,
            nodeCursorRef.current,
            now
        );
    },

    onDownloadResponse() {
        // Latency is maintained by the sweep, not by TTFB
    },
};

// -----------------------------------------------------------------------
// Smart (Intelligent) Strategy — Phase 1 screening, Top-K nodes, no sweep
// -----------------------------------------------------------------------
export const smartStrategy = {
    id: 'smart',
    label: 'Smart (Intelligent)',
    description: 'Screens all nodes by latency probe, then continuously benchmarks only the Top-K fastest using download TTFB.',
    hasLatencySweep: false,
    connectionRotationMs: 0,     // no forced rotation — let TCP CWND run full speed
    useJitter: true,              // jittered intervals reduce CPU spikes
    throttleWorkerStats: true,   // table updates every 5s
    configFields: [
        {
            key: 'topK',
            label: 'Top-K Nodes',
            type: 'slider',
            min: 1,
            max: 16,
            step: 1,
            default: 8,
        },
        {
            key: 'screeningRequests',
            label: 'Screening Probes',
            type: 'slider',
            min: 1,
            max: 9,
            step: 1,
            default: 2,
        },
    ],

    initialize(nodes, { topK = 8, screeningRequests = 2 } = {}) {
        return {
            nodes,
            topK,
            screeningRequests,
            qualifyingNodes: null,
            latencyByNodeId: {},
        };
    },

    // Called from startTest before launching threads — modifies strategyState in-place
    async runPhase1Screening(strategyState, signal, nodeStatsRef, appendLog) {
        const { nodes, topK, screeningRequests } = strategyState;
        appendLog(`Phase 1: Screening ${nodes.length} nodes with ${screeningRequests} probes each...`, 'info');

        const results = await Promise.all(
            nodes.map(async (node) => {
                const median = await screenNodeLatency(node, signal, screeningRequests);
                return { nodeId: node.id, median };
            })
        );

        results.forEach(({ nodeId, median }) => {
            strategyState.latencyByNodeId[nodeId] = median;
        });

        const sorted = results
            .filter(r => r.median !== null)
            .sort((a, b) => a.median - b.median);

        // If we got fewer candidates than topK, use all successful ones (don't exclude them)
        const k = Math.min(topK, sorted.length);
        const qualifying = sorted.slice(0, k).map(r => nodes.find(n => n.id === r.nodeId));

        // Fallback to all successfully screened nodes if fewer than 2 passed
        strategyState.qualifyingNodes = qualifying.length >= 2
            ? qualifying
            : nodes;

        const excluded = nodes.filter(n => !strategyState.qualifyingNodes.find(q => q.id === n.id));
        if (excluded.length > 0) {
            appendLog(`Phase 1: Top ${strategyState.qualifyingNodes.length} nodes prioritized, ${excluded.length} nodes available after warm-up.`, 'info');
            // Give excluded nodes a brief initial cooldown so they're tried less frequently at start
            excluded.forEach(n => {
                if (nodeStatsRef.current[n.id]) {
                    nodeStatsRef.current[n.id].cooldownUntil = Date.now() + 5000;
                }
            });
        } else {
            appendLog(`Phase 1: All ${nodes.length} nodes passed screening.`, 'info');
        }

        return strategyState;
    },

    selectNode({ strategyState, nodeStatsRef, nodeCursorRef, now }) {
        if (!strategyState.qualifyingNodes) return null;

        // Phase 2 continuous re-ranking: sort qualifying nodes by actual throughput
        // every call — fast nodes bubble to the front, slow/cooldown nodes sink
        const qualifyingIds = new Set(strategyState.qualifyingNodes.map(n => n.id));

        const scored = [
            ...strategyState.qualifyingNodes,
            ...strategyState.nodes.filter(n => !qualifyingIds.has(n.id))
        ].map(n => {
            const stat = nodeStatsRef.current[n.id];
            const latency = stat?.latency ?? strategyState.latencyByNodeId[n.id] ?? 9999;
            // Score = high bytes + low latency. Nodes with no bytes yet use initial latency.
            const score = stat?.bytes ? (stat.bytes / Math.max(latency, 1)) : (1000 / Math.max(latency, 1));
            return { node: n, score };
        });

        scored.sort((a, b) => b.score - a.score);
        const pool = scored.map(s => s.node);

        return selectHealthyTrafficNode(
            pool,
            nodeStatsRef.current,
            nodeCursorRef.current,
            now
        );
    },

    onDownloadResponse({ strategyState, nodeStatsRef }, nodeId, ttfbMs) {
        // Smart strategy derives latency entirely from TTFB
        if (nodeStatsRef.current[nodeId]) {
            nodeStatsRef.current[nodeId].latency = Math.round(ttfbMs);
        }
    },
};

// -----------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------

async function screenNodeLatency(node, signal, count = 3, timeoutMs = 1500) {
    const url = node.url.startsWith('http') ? node.url : `https://${node.url}`;

    // Fire all probes in parallel — total time ≈ 1× timeout rather than N×
    const promises = [];
    for (let i = 0; i < count; i++) {
        const cacheBust = `${url}${url.includes('?') ? '&' : '?'}ping=${Date.now()}-${Math.random()}`;
        promises.push(measureLatencySync(cacheBust, signal, timeoutMs));
    }
    const results = (await Promise.all(promises)).filter(r => r !== null);
    if (results.length === 0) return null;
    results.sort((a, b) => a - b);
    return results[Math.floor(results.length / 2)]; // median
}

async function measureLatencySync(url, signal, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort);

    try {
        const start = performance.now();
        await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-store',
            mode: 'cors'
        });
        return Math.max(performance.now() - start, 1);
    } catch {
        return null;
    } finally {
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', onAbort);
    }
}
