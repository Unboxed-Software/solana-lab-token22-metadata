import { clusterApiUrl, Connection } from '@solana/web3.js';
import { initializeKeypair } from '@solana-developers/helpers';
import createNFTWithEmbeddedMetadata from './nft-with-embedded-metadata';
import { uploadOffChainMetadata } from './helpers';

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'), 'finalized');
  const payer = await initializeKeypair(connection);

  const imagePath = 'src/cat.jpg';
  const tokenName = 'Cat NFT';
  const tokenDescription = 'This is a cat';
  const tokenSymbol = 'EMB';
  const tokenExternalUrl = 'https://solana.com/';
  const tokenAdditionalMetadata = {
    species: 'Cat',
    breed: 'Cool',
  }

  const tokenUri = await uploadOffChainMetadata({
    tokenName,
    tokenDescription,
    tokenSymbol,
    imagePath,
    tokenExternalUrl,
    tokenAdditionalMetadata,
  });

  await createNFTWithEmbeddedMetadata({
    payer,
    connection,
    tokenName,
    tokenSymbol,
    tokenUri,
    tokenAdditionalMetadata
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