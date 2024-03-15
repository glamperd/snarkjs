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

    const {fd: fdOld, sections} = await binFileUtils.readBinFile(oldPtauFilename, "ptau", 1); // Has progress to date
    const { curve, power } = await utils.readPTauHeader(fdOld, sections);

    const {fd: fdSec, sections: secSections} = await binFileUtils.readBinFile(sectionFile, "ptau", 1); // Has section to merge

    const fdNew = await binFileUtils.createBinFile(newPTauFilename, "ptau", 1, 11);
    await utils.writePTauHeader(fdNew, curve, power);

    // Copy sections 2 to section-1 from old
    for (let s = 2; s < section; s++) {
        if (sections[s] ) {
            if (logger) logger.debug(`Copying section ${s}`);
            await binFileUtils.copySection(fdOld, sections, fdNew, s);
        }
    }
    // Add new section
    if (logger) logger.debug(`Adding section ${section}`);
    await binFileUtils.copySection(fdSec, secSections, fdNew, section);

    await fdOld.close();
    await fdSec.close();
    await fdNew.close();

    return;

}

