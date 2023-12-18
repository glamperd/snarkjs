/*
    Copyright 2018 0KIMS association.

    This file is part of snarkJS.

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.

    ---------------

    Extract pubkey from a Bellman-format challenge file and 
    write it to a json file.
*/

import * as fastFile from "fastfile";
import Blake2b from "blake2b-wasm";
import * as utils from "./powersoftau_utils.js";
import * as binFileUtils from "@iden3/binfileutils";
import * as misc from "./misc.js";
import { getCurveFromName } from "./curves.js";
import * as fs from "node:fs";

export default async function extractPubkey( contributionFilename, jsonFilename, power, logger) {

    const pow = Number(power);
    await Blake2b.ready();

    const noHash = new Uint8Array(64);
    for (let i=0; i<64; i++) noHash[i] = 0xFF;

    let curve = await getCurveFromName("BN254");

    const sG1 = curve.F1.n8;
    const sG2 = curve.F2.n8;

    const fdResponse = await fastFile.readExisting(contributionFilename);

    const expectedSize =         64 +               // Old Hash
        768 +              // pubkey
        sG2 +              // beta G2
        ((2 ** (pow+1)) - 1)*sG1 +
        (2 ** pow)*sG2 +
        (2 ** pow)*sG1 +
        (2 ** pow)*sG1;               // Beta coeffs G1

    if  (fdResponse.totalSize != expectedSize)
        throw new Error("Size of the contribution is invalid");

    let currentContribution = {};

    const contributionPreviousHash = await fdResponse.read(64);
    const hasherResponse = new Blake2b(64);
    hasherResponse.update(contributionPreviousHash);

    const startSections = [];
    let res;
    res = await processSection(fdResponse, "G1", (2 ** (pow+1) - 1), [0], "tauG1");
    currentContribution.tauG1 = res[0];
    res = await processSection(fdResponse, "G2", (2 ** power), [0], "tauG2");
    currentContribution.tauG2 = res[0];
    res = await processSection(fdResponse, "G1", (2 ** power), [0], "alphaG1");
    currentContribution.alphaG1 = res[0];
    res = await processSection(fdResponse, "G1", (2 ** power), [0], "betaG1");
    currentContribution.betaG1 = res[0];
    res = await processSection(fdResponse, "G2", 1, [0], "betaG2");
    currentContribution.betaG2 = res[0];

    currentContribution.partialHash = hasherResponse.getPartialHash();

    //const buffKey = new Uint8Array(curve.F1.n8*2*6+curve.F2.n8*2*3);
    const buffKey = await fdResponse.read(curve.F1.n8*2*6+curve.F2.n8*2*3);

    currentContribution.key = utils.fromPtauPubKeyRpr(buffKey, 0, curve, false);

    //hasherResponse.update(new Uint8Array(buffKey));
    const hashResponse = hasherResponse.digest();

    if (logger) logger.info(misc.formatHash(hashResponse, "Contribution Response Hash imported: "));

    const nextChallengeHasher = new Blake2b(64);
    nextChallengeHasher.update(hashResponse);

    // await hashSection(nextChallengeHasher, fdNew, "G1", 12, (2 ** power) , "tauG1", logger);
    // await hashSection(nextChallengeHasher, fdNew, "G2", 13, (2 ** power) , "tauG2", logger);
    // await hashSection(nextChallengeHasher, fdNew, "G1", 14, (2 ** power) , "alphaTauG1", logger);
    // await hashSection(nextChallengeHasher, fdNew, "G1", 15, (2 ** power) , "betaTauG1", logger);
    // await hashSection(nextChallengeHasher, fdNew, "G2", 6, 1             , "betaG2", logger);

    currentContribution.nextChallenge = nextChallengeHasher.digest();

    if (logger) logger.info(misc.formatHash(currentContribution.nextChallenge, "Next Challenge Hash: "));
    //const contributions = [];

    //await utils.writeContributions(fdNew, curve, contributions);
    let pubkey = {
        tauG1: misc.byteArray2hex(currentContribution.tauG1),
        tauG2: misc.byteArray2hex(currentContribution.tauG2),
        alphaG1: misc.byteArray2hex(currentContribution.alphaG1),
        betaG1: misc.byteArray2hex(currentContribution.betaG1),
        betaG2: misc.byteArray2hex(currentContribution.betaG2),
        key: {
            tau: keyElementToHex(currentContribution.key.tau),
            alpha: keyElementToHex(currentContribution.key.alpha),
            beta: keyElementToHex(currentContribution.key.beta)
        }
    };
    const json = JSON.stringify(pubkey);
    fs.writeFileSync(jsonFilename, json);

    await fdResponse.close();

    return currentContribution.nextChallenge;

    function keyElementToHex(keyElement) {
        return {
            g1_s: misc.byteArray2hex(keyElement.g1_s),
            g1_sx: misc.byteArray2hex(keyElement.g1_sx),
            g2_spx: misc.byteArray2hex(keyElement.g2_spx),
        };
    }

    async function processSection(fdFrom, groupName, nPoints, singularPointIndexes, sectionName) {
        return await processSectionImportPoints(fdFrom, groupName, nPoints, singularPointIndexes, sectionName);
    }

    async function processSectionImportPoints(fdFrom, groupName, nPoints, singularPointIndexes, sectionName) {

        const G = curve[groupName];
        //const scG = G.F.n8;
        const sG = G.F.n8; //compressed

        const singularPoints = [];

        const nPointsChunk = Math.floor((1<<24)/sG);

        for (let i=0; i< nPoints; i += nPointsChunk) {
            if (logger) logger.debug(`Importing ${sectionName}: ${i}/${nPoints}`);
            const n = Math.min(nPoints-i, nPointsChunk);

            const buffC = await fdFrom.read(n * sG);
            //hasherResponse.update(buffC);

            const buffLEM = await G.batchCtoLEM(buffC);

            for (let j=0; j<singularPointIndexes.length; j++) {
                const sp = singularPointIndexes[j];
                if ((sp >=i) && (sp < i+n)) {
                    const P = G.fromRprLEM(buffLEM, (sp-i)*sG);
                    singularPoints.push(P);
                }
            }
        }

        return singularPoints;
    }

    async function hashSection(nextChallengeHasher, fdTo, groupName, sectionId, nPoints, sectionName, logger) {

        const G = curve[groupName];
        const sG = G.F.n8*2;
        const nPointsChunk = Math.floor((1<<24)/sG);

        const oldPos = fdTo.pos;
        fdTo.pos = startSections[sectionId];

        for (let i=0; i< nPoints; i += nPointsChunk) {
            if (logger) logger.debug(`Hashing ${sectionName}: ${i}/${nPoints}`);
            const n = Math.min(nPoints-i, nPointsChunk);

            const buffLEM = await fdTo.read(n * sG);

            const buffU = await G.batchLEMtoU(buffLEM);

            nextChallengeHasher.update(buffU);
        }

        fdTo.pos = oldPos;
    }

    function bnToBuf(bn) {
        // eslint-disable-next-line no-undef
        var hex = BigInt(bn).toString(16);
        if (hex.length % 2) { hex = "0" + hex; }
      
        var len = hex.length / 2;
        var u8 = new Uint8Array(len);
      
        var i = 0;
        var j = 0;
        while (i < len) {
            u8[i] = parseInt(hex.slice(j, j+2), 16);
            i += 1;
            j += 2;
        }
      
        return u8;
    }

    // Convert contribution key from JSON format
    function deserialiseKey(key) {
        let newKey = {
            alpha: {},
            beta: {},
            tau: {}
        };

        newKey.alpha.g1_s = misc.hex2ByteArray(key.alpha.g1_s);
        newKey.alpha.g1_sx = misc.hex2ByteArray(key.alpha.g1_sx);
        newKey.alpha.g2_spx = misc.hex2ByteArray(key.alpha.g2_spx);
        newKey.beta.g1_s = misc.hex2ByteArray(key.beta.g1_s);
        newKey.beta.g1_sx = misc.hex2ByteArray(key.beta.g1_sx);
        newKey.beta.g2_spx = misc.hex2ByteArray(key.beta.g2_spx);
        newKey.tau.g1_s = misc.hex2ByteArray(key.tau.g1_s);
        newKey.tau.g1_sx = misc.hex2ByteArray(key.tau.g1_sx);
        newKey.tau.g2_spx = misc.hex2ByteArray(key.tau.g2_spx);

        return newKey;
    }

}

