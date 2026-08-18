/**
 * Sample 2: Async User Event Stream & Enrichment Pipeline
 * 
 * Simulates processing a batch of analytics events from a queue.
 * One event in the batch contains malformed nested metadata, causing
 * an unhandled exception inside an async enrichment step.
 */

async function fetchRawEvents() {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 50));

    return [
        { id: 'evt_1', type: 'page_view', user: { id: 'u1', plan: 'pro' }, meta: { ip: '192.168.1.1', country: 'IT' } },
        { id: 'evt_2', type: 'click', user: { id: 'u2', plan: 'free' }, meta: { ip: '10.0.0.1', country: 'US' } },
        { id: 'evt_3', type: 'checkout', user: { id: 'u3', plan: 'enterprise' }, meta: null }, // <--- Missing meta object!
        { id: 'evt_4', type: 'signup', user: { id: 'u4', plan: 'free' }, meta: { ip: '172.16.0.1', country: 'FR' } }
    ];
}

async function enrichEvent(event) {
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Bug: Directly accessing properties on meta without null-checking
    const countryCode = event.meta.country.toUpperCase(); // <--- Throws TypeError on evt_3
    const isEu = ['IT', 'FR', 'DE', 'ES'].includes(countryCode);

    return {
        ...event,
        enriched: {
            countryCode,
            isEu,
            tier: event.user.plan.toUpperCase(),
            processedAt: new Date().toISOString()
        }
    };
}

async function processPipeline() {
    console.log('--- Starting Async Event Pipeline ---');
    const events = await fetchRawEvents();
    console.log(`Fetched ${events.length} events from queue.`);

    const enrichedResults = [];

    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        console.log(`Processing event ${i + 1}/${events.length} (ID: ${event.id})...`);
        const enriched = await enrichEvent(event);
        enrichedResults.push(enriched);
    }

    console.log('--- Pipeline Finished Successfully ---');
    console.log('Processed Events:', JSON.stringify(enrichedResults, null, 2));
}

processPipeline().catch((err) => {
    console.error('💥 FATAL PIPELINE ERROR:', err.message);
});
