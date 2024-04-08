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

export default async function prepareSectionMerge(oldPtauFilename, sectionFile, newPTauFilename, logger) {

    const params = /(.+)_s(\d+)_(\d+)_(\d+)/.exec(sectionFile);
    const section = Number(params[2]);
    const fromPower = Number(params[3]);
    const toPower = Number(params[4]);

    const {fd: fdOld, sections} = await binFileUtils.readBinFile(oldPtauFilename, "ptau", 1); // Has progress to date
    const { curve, power } = await utils.readPTauHeader(fdOld, sections);

    const {fd: fdSec, sections: secSections} = await binFileUtils.readBinFile(sectionFile, "ptau", 1); // Has section to merge

    const fdNew = await binFileUtils.createBinFile(newPTauFilename, "ptau", 1, 11);
    await utils.writePTauHeader(fdNew, curve, power);

    let isMerge = false;
    if (fromPower > 0) {
        isMerge = true;
    } 

    // Copy sections 2 to section-1 from old
    for (let s = 2; s < section; s++) {
        if (sections[s]) {
            if (logger) logger.debug(`Copying section ${s}`);
            await binFileUtils.copySection(fdOld, sections, fdNew, s);
        }
    }

    if (isMerge) {
        // Merge a section's parts: copy 1st part, copy 2nd, then finalise. 
        if (logger) logger.debug(`Adding section ${section} part 1`);
        await mergeSectionParts(fdOld, sections, fdNew, section, 1);
        if (logger) logger.debug(`Adding section ${section} part 2`);
        await mergeSectionParts(fdSec, secSections, fdNew, section, 2);
    } else {
        // Add new section
        if (logger) logger.debug(`Adding section ${section}`);
        await binFileUtils.copySection(fdSec, secSections, fdNew, section);
    }

    await fdOld.close();
    await fdSec.close();
    await fdNew.close();

    return;

}

async function mergeSectionParts(fdFrom, sections, fdTo, sectionId, part) {
    const size = sections[sectionId][0].size;
    const chunkSize = fdFrom.pageSize;
    await binFileUtils.startReadUniqueSection(fdFrom, sections, sectionId);
    if (part == 1) {
        await binFileUtils.startWriteSection(fdTo, sectionId);
    }
    for (let p=0; p<size; p+=chunkSize) {
        const l = Math.min(size -p, chunkSize);
        const buff = await fdFrom.read(l);
        await fdTo.write(buff);
    }
    if (part > 1) {
        await binFileUtils.endWriteSection(fdTo);
    }
    await binFileUtils.endReadSection(fdFrom, size != sections[sectionId][0].size);
}