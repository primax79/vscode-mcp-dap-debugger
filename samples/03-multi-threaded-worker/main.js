/**
 * Sample 3: Multi-Threaded Task Worker Pool
 * 
 * Main thread dispatches tasks across multiple worker threads.
 * Tests multi-threaded call stack inspection, evaluating expressions
 * on specific threads, and variable scopes in concurrent execution.
 */

const { Worker } = require('worker_threads');
const path = require('path');

const TASKS = [
    { id: 1, type: 'fibonacci', n: 10 },
    { id: 2, type: 'prime_factors', n: 84 },
    { id: 3, type: 'matrix_multiply', size: 3, invalidData: true }, // <--- Worker 3 payload has bug
    { id: 4, type: 'fibonacci', n: 12 }
];

function runWorkerTask(task) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, 'worker.js'), {
            workerData: task
        });

        worker.on('message', (result) => resolve(result));
        worker.on('error', (err) => reject(err));
        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

async function startBatchProcessing() {
    console.log(`--- Spawning ${TASKS.length} Concurrent Workers ---`);

    const promises = TASKS.map(async (task) => {
        try {
            const res = await runWorkerTask(task);
            console.log(`Worker result for task ${task.id}:`, res);
            return res;
        } catch (err) {
            console.error(`Worker error on task ${task.id}:`, err.message);
            return { taskId: task.id, status: 'failed', error: err.message };
        }
    });

    const results = await Promise.all(promises);
    console.log('--- Batch Processing Completed ---');
    console.log(JSON.stringify(results, null, 2));
}

startBatchProcessing();
