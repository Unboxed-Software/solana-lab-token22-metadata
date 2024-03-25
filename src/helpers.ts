import { Connection, Keypair } from '@solana/web3.js';
import { bundlrStorage, keypairIdentity, Metaplex, toMetaplexFile } from '@metaplex-foundation/js';
import fs from 'fs';

export interface CreateNFTInputs {
  payer: Keypair;
  connection: Connection;
  tokenName: string;
  tokenSymbol: string;
  tokenUri: string;
}

export interface UploadOffChainMetadataInputs {
  connection: Connection;
  payer: Keypair;
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  imagePath: string;
}

export async function uploadOffChainMetadata(inputs: UploadOffChainMetadataInputs) {
  const { connection, payer, tokenName, tokenDescription, tokenSymbol, imagePath } = inputs;

  // We are using metaplex API's to upload our metadata and images
  // however this is not necessary, you can use any storage provider you want
  // Metaplex is doing nothing special here, you just need to host the files somewhere and
  // have a uri pointing to the metadata file
  // if you're interested into learning a different one, look at SHDW drive
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(payer))
    .use(
      bundlrStorage({
        address: 'https://devnet.bundlr.network',
        providerUrl: 'https://api.devnet.solana.com',
        timeout: 60000,
      }),
    );

  // file to buffer
  const buffer = fs.readFileSync('src/' + imagePath);

  // buffer to metaplex file
  const file = toMetaplexFile(buffer, imagePath);

  // upload image and get image uri
  const imageUri = await metaplex.storage().upload(file);
  console.log('image uri:', imageUri);

  // upload metadata and get metadata uri (off chain metadata)
  const { uri } = await metaplex
    .nfts()
    .uploadMetadata({
      name: tokenName,
      description: tokenDescription,
      symbol: tokenSymbol,
      image: imageUri,
    })
    .run();

  return uri;
}
