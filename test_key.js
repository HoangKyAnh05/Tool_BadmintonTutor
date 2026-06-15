const apiKey = 'AQ.Ab8RN6KdaAzrVBuMEWV-QO18e56koV9ScO5j_jYsqUyQcEfEAg';

async function test() {
  try {
    // 1. List models to see what is supported
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
