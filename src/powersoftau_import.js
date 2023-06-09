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
*/

import * as fastFile from "fastfile";
import Blake2b from "blake2b-wasm";
import * as utils from "./powersoftau_utils.js";
import * as binFileUtils from "@iden3/binfileutils";
import * as misc from "./misc.js";
import { getCurveFromQ } from "./curves.js";
import * as fs from 'fs';
import { Scalar, utils as ffUtils } from "ffjavascript";

export default async function importResponse(oldPtauFilename, contributionFilename, newPTauFilename, name, importPoints, logger) {

    await Blake2b.ready();

    const noHash = new Uint8Array(64);
    for (let i=0; i<64; i++) noHash[i] = 0xFF;

    let curve, power, contributions;

    if (oldPtauFilename.endsWith(".json")) {
        const jsonData = fs.readFileSync(oldPtauFilename);
        const jsonObj = JSON.parse(jsonData);
        ({contributions, power} = jsonObj);

        // get curve from q
        const qs = Scalar.e(jsonObj.q);
        curve = await getCurveFromQ(qs);
        // no points (sections !)
        // Convert contribution hashes 
        for (const i in contributions) {
            contributions[i].nextChallenge = misc.hex2ByteArray(contributions[i].nextChallenge);
            contributions[i].partialHash = misc.hex2ByteArray(contributions[i].partialHash);
            contributions[i].responseHash = misc.hex2ByteArray(contributions[i].responseHash);
            contributions[i].tauG1 = misc.hex2ByteArray(contributions[i].tauG1);
            contributions[i].tauG2 = misc.hex2ByteArray(contributions[i].tauG2);
            contributions[i].alphaG1 = misc.hex2ByteArray(contributions[i].alphaG1);
            contributions[i].betaG1 = misc.hex2ByteArray(contributions[i].betaG1);
            contributions[i].betaG2 = misc.hex2ByteArray(contributions[i].betaG2);
            contributions[i].key = deserialiseKey(contributions[i].key);
        }

    } else {
        const {fd: fdOld, sections} = await binFileUtils.readBinFile(oldPtauFilename, "ptau", 1);
        ({curve, power} = await utils.readPTauHeader(fdOld, sections));
        contributions = await utils.readContributions(fdOld, curve, sections);
        await fdOld.close();
    }
    const currentContribution = {};

    if (name) currentContribution.name = name;

    const sG1 = curve.F1.n8*2;
    const scG1 = curve.F1.n8; // Compressed size
    const sG2 = curve.F2.n8*2;
    const scG2 = curve.F2.n8; // Compressed size

    const fdResponse = await fastFile.readExisting(contributionFilename);

    if  (fdResponse.totalSize !=
        64 +                            // Old Hash
        ((2 ** power)*2-1)*scG1 +
        (2 ** power)*scG2 +
        (2 ** power)*scG1 +
        (2 ** power)*scG1 +
        scG2 +
        sG1*6 + sG2*3)
        throw new Error("Size of the contribution is invalid");

    let lastChallengeHash;

    if (contributions.length>0) {
        lastChallengeHash = contributions[contributions.length-1].nextChallenge;
    } else {
        // Temporary disable if no contrib history in json
        //lastChallengeHash = utils.calculateFirstChallengeHash(curve, power, logger);
    }

    const fdNew = await binFileUtils.createBinFile(newPTauFilename, "ptau", 1, importPoints ? 7: 2);
    await utils.writePTauHeader(fdNew, curve, power);

    const contributionPreviousHash = await fdResponse.read(64);

    if (lastChallengeHash && misc.hashIsEqual(noHash,lastChallengeHash)) {
        lastChallengeHash = contributionPreviousHash;
        contributions[contributions.length-1].nextChallenge = lastChallengeHash;
    }

    if(lastChallengeHash && !misc.hashIsEqual(contributionPreviousHash,lastChallengeHash)) {
        if (logger) {
            //logger.info("prev hash " + contributionPreviousHash.toString());
            logger.info(misc.formatHash(contributionPreviousHash, "Prev hash"));
            //logger.info("last hash type" + typeof(lastChallengeHash));
            logger.info(misc.formatHash(lastChallengeHash, "Last challenge hash"));
        }
        throw new Error("Wrong contribution. This contribution is not based on the previous hash");
    }

    const hasherResponse = new Blake2b(64);
    hasherResponse.update(contributionPreviousHash);

    const startSections = [];
    let res;
    res = await processSection(fdResponse, fdNew, "G1", 2, (2 ** power) * 2 -1, [1], "tauG1");
    currentContribution.tauG1 = res[0];
    res = await processSection(fdResponse, fdNew, "G2", 3, (2 ** power)       , [1], "tauG2");
    currentContribution.tauG2 = res[0];
    res = await processSection(fdResponse, fdNew, "G1", 4, (2 ** power)       , [0], "alphaG1");
    currentContribution.alphaG1 = res[0];
    res = await processSection(fdResponse, fdNew, "G1", 5, (2 ** power)       , [0], "betaG1");
    currentContribution.betaG1 = res[0];
    res = await processSection(fdResponse, fdNew, "G2", 6, 1                  , [0], "betaG2");
    currentContribution.betaG2 = res[0];

    currentContribution.partialHash = hasherResponse.getPartialHash();


    const buffKey = await fdResponse.read(curve.F1.n8*2*6+curve.F2.n8*2*3);

    currentContribution.key = utils.fromPtauPubKeyRpr(buffKey, 0, curve, false);

    hasherResponse.update(new Uint8Array(buffKey));
    const hashResponse = hasherResponse.digest();

    if (logger) logger.info(misc.formatHash(hashResponse, "Contribution Response Hash imported: "));

    if (importPoints) {
        const nextChallengeHasher = new Blake2b(64);
        nextChallengeHasher.update(hashResponse);

        await hashSection(nextChallengeHasher, fdNew, "G1", 2, (2 ** power) * 2 -1, "tauG1", logger);
        await hashSection(nextChallengeHasher, fdNew, "G2", 3, (2 ** power)       , "tauG2", logger);
        await hashSection(nextChallengeHasher, fdNew, "G1", 4, (2 ** power)       , "alphaTauG1", logger);
        await hashSection(nextChallengeHasher, fdNew, "G1", 5, (2 ** power)       , "betaTauG1", logger);
        await hashSection(nextChallengeHasher, fdNew, "G2", 6, 1                  , "betaG2", logger);

        currentContribution.nextChallenge = nextChallengeHasher.digest();

        if (logger) logger.info(misc.formatHash(currentContribution.nextChallenge, "Next Challenge Hash: "));
    } else {
        currentContribution.nextChallenge = noHash;
    }

    contributions.push(currentContribution);

    await utils.writeContributions(fdNew, curve, contributions);

    await fdResponse.close();
    await fdNew.close();

    return currentContribution.nextChallenge;

    async function processSection(fdFrom, fdTo, groupName, sectionId, nPoints, singularPointIndexes, sectionName) {
        if (importPoints) {
            return await processSectionImportPoints(fdFrom, fdTo, groupName, sectionId, nPoints, singularPointIndexes, sectionName);
        } else {
            return await processSectionNoImportPoints(fdFrom, fdTo, groupName, sectionId, nPoints, singularPointIndexes, sectionName);
        }
    }

    async function processSectionImportPoints(fdFrom, fdTo, groupName, sectionId, nPoints, singularPointIndexes, sectionName) {

        const G = curve[groupName];
        const scG = G.F.n8;
        const sG = G.F.n8*2;

        const singularPoints = [];

        await binFileUtils.startWriteSection(fdTo, sectionId);
        const nPointsChunk = Math.floor((1<<24)/sG);

        startSections[sectionId] = fdTo.pos;

        for (let i=0; i< nPoints; i += nPointsChunk) {
            if (logger) logger.debug(`Importing ${sectionName}: ${i}/${nPoints}`);
            const n = Math.min(nPoints-i, nPointsChunk);

            const buffC = await fdFrom.read(n * scG);
            hasherResponse.update(buffC);

            const buffLEM = await G.batchCtoLEM(buffC);

            await fdTo.write(buffLEM);
            for (let j=0; j<singularPointIndexes.length; j++) {
                const sp = singularPointIndexes[j];
                if ((sp >=i) && (sp < i+n)) {
                    const P = G.fromRprLEM(buffLEM, (sp-i)*sG);
                    singularPoints.push(P);
                }
            }
        }

        await binFileUtils.endWriteSection(fdTo);

        return singularPoints;
    }


    async function processSectionNoImportPoints(fdFrom, fdTo, groupName, sectionId, nPoints, singularPointIndexes, sectionName) {

        const G = curve[groupName];
        const scG = G.F.n8;

        const singularPoints = [];

        const nPointsChunk = Math.floor((1<<24)/scG);

        for (let i=0; i< nPoints; i += nPointsChunk) {
            if (logger) logger.debug(`Importing ${sectionName}: ${i}/${nPoints}`);
            const n = Math.min(nPoints-i, nPointsChunk);

            const buffC = await fdFrom.read(n * scG);
            hasherResponse.update(buffC);

            for (let j=0; j<singularPointIndexes.length; j++) {
                const sp = singularPointIndexes[j];
                if ((sp >=i) && (sp < i+n)) {
                    const P = G.fromRprCompressed(buffC, (sp-i)*scG);
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

    // Convert contriution key from JSON format
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

