import {
  clusterApiUrl,
  Connection,
  Keypair,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  AuthorityType,
  createAssociatedTokenAccountInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToCheckedInstruction,
  createSetAuthorityInstruction,
  ExtensionType,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
  getMintLen,
  getTokenMetadata,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
} from '@solana/spl-token';
import { getKeypairFromFile } from '@solana-developers/helpers';
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
  TokenMetadata,
} from '@solana/spl-token-metadata';
import { bundlrStorage, keypairIdentity, Metaplex, toMetaplexFile } from '@metaplex-foundation/js';
import fs from 'fs';

const image = 'cat.jpg';

const uploadOffChainMetadata = async ({
  connection,
  payer,
  tokenName,
}: {
  connection: Connection;
  payer: Keypair;
  tokenName: string;
}) => {
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
  const buffer = fs.readFileSync('src/' + image);

  // buffer to metaplex file
  const file = toMetaplexFile(buffer, image);

  // upload image and get image uri
  const imageUri = await metaplex.storage().upload(file);
  console.log('image uri:', imageUri);

  // upload metadata and get metadata uri (off chain metadata)
  const { uri } = await metaplex
    .nfts()
    .uploadMetadata({
      name: tokenName,
      description: 'some description could go here',
      image: imageUri,
    })
    .run();

  return uri;
};

export default async function main() {
  const connection = new Connection(clusterApiUrl('devnet'), 'finalized');

  const mint = Keypair.generate();
  const payer = await getKeypairFromFile('~/.config/solana/id.json');

  const tokenName = 'Token with embedded metadata';

  const uri = await uploadOffChainMetadata({ payer, connection, tokenName });
  console.log('metadata uri:', uri);

  const metadata: TokenMetadata = {
    mint: mint.publicKey,
    name: tokenName,
    symbol: 'TWIM',
    uri,
    additionalMetadata: [['customField', 'customValue']],
  };

  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);

  // NFT should have 0 decimals
  const decimals = 0;

  const createMintAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    lamports,
    newAccountPubkey: mint.publicKey,
    programId: TOKEN_2022_PROGRAM_ID,
    space: mintLen,
  });

  // Even if we want to use the metadata-extension, we still need to use the metadata-pointer-extension but it will point to the mint it self
  const initMetadataPointerIx = createInitializeMetadataPointerInstruction(
    mint.publicKey,
    payer.publicKey,
    mint.publicKey,
    TOKEN_2022_PROGRAM_ID,
  );

  const initMintIx = createInitializeMintInstruction(
    mint.publicKey,
    decimals,
    payer.publicKey,
    payer.publicKey,
    TOKEN_2022_PROGRAM_ID,
  );

  const initMetadataIx = createInitializeInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    mint: mint.publicKey,
    metadata: mint.publicKey,
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadata.uri,
    mintAuthority: payer.publicKey,
    updateAuthority: payer.publicKey,
  });

  const updateMetadataFieldIx = createUpdateFieldInstruction({
    metadata: mint.publicKey,
    updateAuthority: payer.publicKey,
    programId: TOKEN_2022_PROGRAM_ID,
    field: metadata.additionalMetadata[0][0],
    value: metadata.additionalMetadata[0][1],
  });

  // we will need this to mint our NFT to it
  const ata = await getAssociatedTokenAddress(mint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const createATAIx = createAssociatedTokenAccountInstruction(
    payer.publicKey,
    ata,
    payer.publicKey,
    mint.publicKey,
    TOKEN_2022_PROGRAM_ID,
  );

  const mintIX = createMintToCheckedInstruction(
    mint.publicKey,
    ata,
    payer.publicKey,
    // NFTs should have a supply of one
    1,
    decimals,
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );

  // NFTs should have no mint authority so no one can mint any more of the same NFT
  const setMintTokenAuthorityIx = createSetAuthorityInstruction(
    mint.publicKey,
    payer.publicKey,
    AuthorityType.MintTokens,
    null,
    undefined,
    TOKEN_2022_PROGRAM_ID,
  );

  const transaction = new Transaction().add(
    createMintAccountIx,
    // We should always init the metadata pointer before the mint, otherwise it will error
    initMetadataPointerIx,
    initMintIx,
    initMetadataIx,
    updateMetadataFieldIx,
    createATAIx,
    mintIX,
    setMintTokenAuthorityIx,
  );
  const transactionSignature = await sendAndConfirmTransaction(connection, transaction, [payer, mint]);
  console.log(`Transaction: https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`);

  // Now we can fetch the account and the mint and look at the details

  // Fetching the account
  const accountDetails = await getAccount(connection, ata, 'finalized', TOKEN_2022_PROGRAM_ID);
  console.log('Associate Token Account =====>', accountDetails);

  // Fetching the mint
  const mintDetails = await getMint(connection, mint.publicKey, undefined, TOKEN_2022_PROGRAM_ID);
  console.log('Mint =====>', mintDetails);

  // Since the mint stores the metadata in itself, we can just get it like this
  const onChainMetadata = await getTokenMetadata(connection, mint.publicKey);
  // Now we can see the metadata coming with the mint
  console.log('On-chain metadata =====>', onChainMetadata);

  // And we can even get the off-chain json now
  if (onChainMetadata && onChainMetadata.uri) {
    const offChainMetadata = await fetch(onChainMetadata.uri).then((res) => res.json());
    console.log('Mint off-chain metadata =====>', offChainMetadata);
  }
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
