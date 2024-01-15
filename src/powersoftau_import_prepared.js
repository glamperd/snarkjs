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

    Imports a prepared and reduced file from Bellman. 
    The prepared file will be named phase2radix2m??
    Tau G1 & G2 points come from the beacon file
    We also need contribution history and beacon contribution details.

*/

import * as fastFile from "fastfile";
import Blake2b from "blake2b-wasm";
import * as utils from "./powersoftau_utils.js";
import * as binFileUtils from "@iden3/binfileutils";
import * as misc from "./misc.js";
import { getCurveFromName } from "./curves.js";

export default async function importPrepared( preparedFilename, oldPtauFilename, newPTauFilename, cPower, filePower, logger) {

    const ceremonyPowers = parseInt(cPower);

    await Blake2b.ready();

    const noHash = new Uint8Array(64);
    for (let i=0; i<64; i++) noHash[i] = 0xFF;

    let curve = await getCurveFromName("BN254");

    const sG1 = curve.F1.n8*2;
    const scG1 = curve.F1.n8; // Compressed size
    const sG2 = curve.F2.n8*2;
    const scG2 = curve.F2.n8; // Compressed size

    const fdPrepared = await fastFile.readExisting(preparedFilename);

    const expectedSize = 
        sG1 +              // alpha G1
        sG1 +              // beta G1
        sG2 +              // Beta G2
        ((2 ** filePower)-1)*sG1 +  // tau coeffs G1
        (2 ** filePower)*sG2 +      //  tau coeffs G2
        (2 ** filePower)*sG1 +      // alpha coeffs G1
        (2 ** filePower)*sG1 +      // Beta coeffs G1
        (2 ** filePower)*sG1;       // H

    if  (fdPrepared.totalSize != expectedSize)
        throw new Error("Size of the contribution is invalid");

    let contributions = [];
    // .ptau file imported from beacon response
    const {fd: fdOld, sections} = await binFileUtils.readBinFile(oldPtauFilename, "ptau", 1);
    contributions = await utils.readContributions(fdOld, curve, sections);

    const fdNew = await binFileUtils.createBinFile(newPTauFilename, "ptau", 1, 11);
    await utils.writePTauHeader(fdNew, curve, filePower, ceremonyPowers);

    const startSections = [];
    // Sections from beacon file
    await processSection(fdOld, sections[2], fdNew, "G1", 2, true, (2 ** filePower) * 2 - 1, [], "tauG1");
    await processSection(fdOld, sections[3], fdNew, "G2", 3, true, (2 ** filePower), [], "tauG2");
    await processSection(fdOld, sections[4], fdNew, "G1", 4, true, (2 ** filePower), [], "alphaG1");
    await processSection(fdOld, sections[5], fdNew, "G1", 5, true, (2 ** filePower), [], "betaG1");
    await processSection(fdOld, sections[6], fdNew, "G2", 6, true, 1, [], "betaG2");

    // Sections from prepared file
    fdPrepared.pos += sG2; // skip beta G2
    await processSection(fdPrepared, null, fdNew, "G1", 12, true, (2 ** filePower)-1, [], "tauG1");
    await processSection(fdPrepared, null, fdNew, "G2", 13, true, (2 ** filePower), [], "tauG2");
    await processSection(fdPrepared, null, fdNew, "G1", 14, true, (2 ** filePower), [], "alphaG1");
    await processSection(fdPrepared, null, fdNew, "G1", 15, true, (2 ** filePower), [], "betaG1");

    // Convert last contribution to beacon
    let beaconContrib = contributions[contributions.length - 1];
    beaconContrib.type = 1;
    beaconContrib.name = "Beacon";
    beaconContrib.beaconHash = misc.hex2ByteArray("e586fccaf245c9a1d7e78294d4802018f3001149a71b8f10cd997ef8235aa372");
    beaconContrib.numIterationsExp = 10;
    await utils.writeContributions(fdNew, curve, contributions);

    await fdOld.close(); // old ptau
    await fdPrepared.close();
    await fdNew.close();

    if (logger) logger.info("Done");

    return;

    async function processSection(fdFrom, section, fdTo, groupName, sectionId, copyOnly, nPoints, singularPointIndexes, sectionName) {
        const G = curve[groupName];
        //const scG = G.F.n8;
        const sG = G.F.n8*2;

        const minPoints = Math.max(nPoints, ...singularPointIndexes.map(i => i+1));
        const singularPoints = [];

        await binFileUtils.startWriteSection(fdTo, sectionId);
        const nPointsChunk = Math.floor((1<<24)/sG);

        startSections[sectionId] = fdTo.pos;

        for (let i=0; i< minPoints; i += nPointsChunk) {
            if (logger) logger.debug(`Importing ${sectionName}: ${i}/${nPoints}`);
            const n = Math.min(minPoints-i, nPointsChunk);

            if (section) fdFrom.pos = section[0].p;
            const buffC = await fdFrom.read(n * sG);
            //hasherResponse.update(buffC);

            let buffLEM = 
                copyOnly ? buffC
                    : await G.batchUtoLEM(buffC);

            if (i < nPoints) {
                await fdTo.write(buffLEM);
            }
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

    function deserialiseContribution(contrib) {
        return {
            tauG1: misc.hex2ByteArray(contrib.tauG1),
            tauG2: misc.hex2ByteArray(contrib.tauG2),
            alphaG1: misc.hex2ByteArray(contrib.alphaG1),
            betaG1: misc.hex2ByteArray(contrib.betaG1),
            betaG2: misc.hex2ByteArray(contrib.betaG2),
            key: deserialiseKey(contrib.key),
            type: contrib.type,
            name: contrib.name,
            numIterationsExp: contrib.numIterationsExp,
            beaconHash: misc.hex2ByteArray(contrib.beaconHash),
        };
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

