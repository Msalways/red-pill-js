const { Redpill } = require('./dist/index.js');
const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const rp = new Redpill()
  .setLlm(client)
  .build();

const testData = {
  orders: [
    { id: 1, category: 'Electronics', amount: 100, status: 'completed' },
    { id: 2, category: 'Clothing', amount: 50, status: 'pending' },
    { id: 3, category: 'Electronics', amount: 200, status: 'completed' },
    { id: 4, category: 'Food', amount: 30, status: 'cancelled' },
    { id: 5, category: 'Clothing', amount: 75, status: 'completed' },
  ]
};

const testPrompt = 'show me orders by category';

async function main() {
  console.log('Generating spec for:', testPrompt);
  
  const specResult = await rp.generateSpec(testData, testPrompt);
  console.log('Spec:', JSON.stringify(specResult.spec, null, 2));
  
  console.log('\nExecuting spec on data...');
  const execResult = rp.execute(specResult.spec, testData);
  console.log('Chart data:', JSON.stringify(execResult.data, null, 2));
}

main().catch(console.error);
