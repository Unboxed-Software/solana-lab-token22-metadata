import { Connection, Keypair } from '@solana/web3.js';
import { bundlrStorage, keypairIdentity, Metaplex, toMetaplexFile } from '@metaplex-foundation/js';
import fs from 'fs';
import * as web3 from '@solana/web3.js';
import dotenv from 'dotenv';
import { getKeypairFromFile } from '@solana-developers/helpers';
dotenv.config();

async function airdropSolIfNeeded(signer: web3.Keypair, connection: web3.Connection) {
  const balance = await connection.getBalance(signer.publicKey);
  console.log('Current balance is', balance / web3.LAMPORTS_PER_SOL);

  if (balance < web3.LAMPORTS_PER_SOL) {
    console.log('Airdropping 1 SOL...');
    const airdropSignature = await connection.requestAirdrop(signer.publicKey, web3.LAMPORTS_PER_SOL);

    const latestBlockHash = await connection.getLatestBlockhash();

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    const newBalance = await connection.getBalance(signer.publicKey);
    console.log('New balance is', newBalance / web3.LAMPORTS_PER_SOL);
  }
}

export async function initializeKeypair(connection: web3.Connection, keyPairFilePath?: string): Promise<web3.Keypair> {
  if (keyPairFilePath) {
    const signer = await getKeypairFromFile(keyPairFilePath);

    await airdropSolIfNeeded(signer, connection);

    return signer;
  } else if (process.env.PRIVATE_KEY) {
    const secret = JSON.parse(process.env.PRIVATE_KEY ?? '') as number[];
    const secretKey = Uint8Array.from(secret);
    const keypairFromSecretKey = web3.Keypair.fromSecretKey(secretKey);

    await airdropSolIfNeeded(keypairFromSecretKey, connection);

    return keypairFromSecretKey;
  } else {
    console.log('Creating .env file');

    const signer = web3.Keypair.generate();
    fs.writeFileSync('.env', `PRIVATE_KEY=[${signer.secretKey.toString()}]`);
    await airdropSolIfNeeded(signer, connection);

    return signer;
  }
}

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
