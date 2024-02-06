import { Connection, Keypair } from '@solana/web3.js';
import { bundlrStorage, keypairIdentity, Metaplex, toMetaplexFile } from '@metaplex-foundation/js';
import fs from 'fs';
import * as web3 from '@solana/web3.js';
import dotenv from 'dotenv';
import { getKeypairFromFile, requestAndConfirmAirdropIfRequired } from '@solana-developers/helpers';
dotenv.config();

export async function initializeKeypair(connection: web3.Connection, keyPairFilePath?: string): Promise<web3.Keypair> {
  if (keyPairFilePath) {
    const signer = await getKeypairFromFile(keyPairFilePath);

    await requestAndConfirmAirdropIfRequired(connection, signer.publicKey, 2, 1);

    return signer;
  } else if (process.env.PRIVATE_KEY) {
    const secret = JSON.parse(process.env.PRIVATE_KEY ?? '') as number[];
    const secretKey = Uint8Array.from(secret);
    const keypairFromSecretKey = web3.Keypair.fromSecretKey(secretKey);

    await requestAndConfirmAirdropIfRequired(connection, keypairFromSecretKey.publicKey, 2, 1);

    return keypairFromSecretKey;
  } else {
    console.log('Creating .env file');

    const signer = web3.Keypair.generate();
    fs.writeFileSync('.env', `PRIVATE_KEY=[${signer.secretKey.toString()}]`);
    await requestAndConfirmAirdropIfRequired(connection, signer.publicKey, 2, 1);

    return signer;
  }
}

export interface CreateTokenInputs {
  payer: Keypair;
  connection: Connection;
  tokenName: string;
  tokenSymbol: string;
  tokenUri: string;
  amount: number;
  decimals: number;
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
