import { clusterApiUrl, Connection } from '@solana/web3.js';
import { initializeKeypair, uploadOffChainMetadata } from './helpers';
import createTokenWithEmbeddedMetadata from './token-with-embedded-metadata';

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'), 'finalized');

  const payer = await initializeKeypair(connection, '~/.config/solana/id.json');

  const imagePath = 'cat.jpg';
  const tokenName = 'Cool Cat Token';
  const tokenDescription = 'This is a cat';
  const tokenSymbol = 'EMB';

  const tokenUri = await uploadOffChainMetadata({
    connection,
    payer,
    tokenName,
    tokenDescription,
    tokenSymbol,
    imagePath,
  });

  await createTokenWithEmbeddedMetadata({
    payer,
    connection,
    tokenName,
    tokenSymbol,
    tokenUri,
    amount: 10,
    decimals: 4,
  });
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
