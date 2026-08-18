const { workerData, parentPort } = require('worker_threads');

function computeFibonacci(n) {
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) {
        const temp = a + b;
        a = b;
        b = temp;
    }
    return b;
}

function computePrimeFactors(n) {
    const factors = [];
    let divisor = 2;
    while (n >= 2) {
        if (n % divisor === 0) {
            factors.push(divisor);
            n = n / divisor;
        } else {
            divisor++;
        }
    }
    return factors;
}

function processMatrix(size, isInvalid) {
    if (isInvalid) {
        // Simulates unhandled edge case in worker
        throw new Error(`Matrix multiplication failed: invalid dimensions for size ${size}`);
    }
    return { matrixSize: size, checksum: size * size };
}

function executeTask(task) {
    const startTime = Date.now();

    let output;
    switch (task.type) {
        case 'fibonacci':
            output = computeFibonacci(task.n);
            break;
        case 'prime_factors':
            output = computePrimeFactors(task.n);
            break;
        case 'matrix_multiply':
            output = processMatrix(task.size, task.invalidData);
            break;
        default:
            throw new Error(`Unknown task type: ${task.type}`);
    }

    return {
        taskId: task.id,
        type: task.type,
        output,
        durationMs: Date.now() - startTime
    };
}

const result = executeTask(workerData);
parentPort.postMessage(result);
