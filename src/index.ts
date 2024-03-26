import { clusterApiUrl, Connection } from '@solana/web3.js';
import { initializeKeypair } from '@solana-developers/helpers';
import dotenv from 'dotenv';
import { uploadOffChainMetadata } from './helpers';
dotenv.config();

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'), 'finalized');
  const payer = await initializeKeypair(connection);

  
}

main()
  .then(() => {
    console.log('Finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
