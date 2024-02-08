import { Connection, clusterApiUrl } from "@solana/web3.js";
import createNFTWithEmbeddedMetadata from "./embedded-metadata";
import { getKeypairFromFile } from "@solana-developers/helpers";
import { uploadOffChainMetadata } from "./nft-helpers";
import createNFTWithMetadataPointer from "./metadata-with-pointer";

async function main() {

  const connection = new Connection(clusterApiUrl('devnet'), 'finalized');
  //TODO look at this for an .env file
  const payer = await getKeypairFromFile('~/.config/solana/id.json');

  const imagePath = 'cat.jpg';
  const tokenName = 'Cat NFT';
  const tokenDescription = 'This is a cat'
  const tokenSymbol = 'EMB';

  const tokenUri = await uploadOffChainMetadata({
    connection,
    payer,
    tokenName,
    tokenDescription,
    tokenSymbol,
    imagePath,
  });

  await createNFTWithEmbeddedMetadata({
    payer,
    connection,
    tokenName,
    tokenSymbol,
    tokenUri,
  });

  await createNFTWithMetadataPointer({
    payer,
    connection,
    tokenName,
    tokenSymbol,
    tokenUri,
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
