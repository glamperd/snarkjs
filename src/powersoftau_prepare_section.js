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

import * as binFileUtils from "@iden3/binfileutils";
import * as utils from "./powersoftau_utils.js";
import {BigBuffer} from "ffjavascript";

export default async function prepareSection(oldPtauFilename, newPTauFilename, section, fromPower, toPower, logger) {

    const {fd: fdOld, sections} = await binFileUtils.readBinFile(oldPtauFilename, "ptau", 1);
    const {curve, power} = await utils.readPTauHeader(fdOld, sections);

    const newSection = 10 + Number(section);
    const newName = `${newPTauFilename}_s${newSection}_${fromPower}_${toPower}.ptau`;
    const fdNew = await binFileUtils.createBinFile(newName, "ptau", 1, 11);
    await utils.writePTauHeader(fdNew, curve, power);

    switch (Number(section)) {
    case 2: 
        await processSection(2, newSection, "G1", "tauG1", fromPower, toPower ); 
        break;
    case 3: 
        await processSection(3, newSection, "G2", "tauG2", fromPower, toPower );
        break;
    case 4: 
        await processSection(4, newSection, "G1", "alphaTauG1", fromPower, toPower );
        break;
    case 5:
        await processSection(5, newSection, "G1", "betaTauG1", fromPower, toPower );
        break;
    default:
        logger.info(`Invalid section number ${section}`);
    }

    await fdOld.close();
    await fdNew.close();

    // await fs.promises.unlink(newPTauFilename+ ".tmp");

    return;

    async function processSection(oldSectionId, newSectionId, Gstr, sectionName, fromPower, toPower) {
        if (logger) logger.debug("Starting section: "+sectionName+":"+fromPower+" to "+toPower);

        await binFileUtils.startWriteSection(fdNew, newSectionId);

        for (let p=fromPower; p<=Math.min(toPower, power); p++) {
            await processSectionPower(p);
        }

        if (oldSectionId == 2 && toPower>power) {
            await processSectionPower(power+1);
        }

        await binFileUtils.endWriteSection(fdNew);


        async function processSectionPower(p) {
            const nPoints = 2 ** p;
            const G = curve[Gstr];
            const Fr = curve.Fr;
            const sGin = G.F.n8*2;
            const sGmid = G.F.n8*3;

            let buff;
            buff = new BigBuffer(nPoints*sGin);

            await binFileUtils.startReadUniqueSection(fdOld, sections, oldSectionId);
            if ((oldSectionId == 2)&&(p==power+1)) {
                await fdOld.readToBuffer(buff, 0,(nPoints-1)*sGin );
                buff.set(curve.G1.zeroAffine, (nPoints-1)*sGin );
            } else {
                await fdOld.readToBuffer(buff, 0,nPoints*sGin );
            }
            await binFileUtils.endReadSection(fdOld, true);


            buff = await G.lagrangeEvaluations(buff, "affine", "affine", logger, sectionName);
            await fdNew.write(buff);

/*
            if (p <= curve.Fr.s) {
                buff = await G.ifft(buff, "affine", "affine", logger, sectionName);
                await fdNew.write(buff);
            } else if (p == curve.Fr.s+1) {
                const smallM = 1<<curve.Fr.s;
                let t0 = new BigBuffer( smallM * sGmid );
                let t1 = new BigBuffer( smallM * sGmid );

                const shift_to_small_m = Fr.exp(Fr.shift, smallM);
                const one_over_denom = Fr.inv(Fr.sub(shift_to_small_m, Fr.one));

                let sInvAcc = Fr.one;
                for (let i=0; i<smallM; i++) {
                    const ti =  buff.slice(i*sGin, (i+1)*sGin);
                    const tmi = buff.slice((i+smallM)*sGin, (i+smallM+1)*sGin);

                    t0.set(
                        G.timesFr(
                            G.sub(
                                G.timesFr(ti , shift_to_small_m),
                                tmi
                            ),
                            one_over_denom
                        ),
                        i*sGmid
                    );
                    t1.set(
                        G.timesFr(
                            G.sub( tmi, ti),
                            Fr.mul(sInvAcc, one_over_denom)
                        ),
                        i*sGmid
                    );


                    sInvAcc = Fr.mul(sInvAcc, Fr.shiftInv);
                }
                t0 = await G.ifft(t0, "jacobian", "affine", logger, sectionName + " t0");
                await fdNew.write(t0);
                t0 = null;
                t1 = await G.ifft(t1, "jacobian", "affine", logger, sectionName + " t0");
                await fdNew.write(t1);

            } else {
                if (logger) logger.error("Power too big");
                throw new Error("Power to big");
            }
*/
        }
    }
}

