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

export default async function prepareSectionMerge(oldPtauFilename, newPTauFilename, logger) {

    const params = /(.+)_(\d+)_(\d+)_(\d+)/.exec(oldPtauFilename);
    const section = params[2];
    const fromPower = params[3];
    const toPower = params[4];

    const {fd: fdOld, sections} = await binFileUtils.readBinFile(oldPtauFilename, "ptau", 1);
    const {curve, power} = await utils.readPTauHeader(fdOld, sections);

    const {fd: fdNew, sections: newSections} = await binFileUtils.readBinFile(newPTauFilename, "ptau", 1);
    await utils.writePTauHeader(fdNew, curve, power);

    await binFileUtils.copySection(fdOld, sections, fdNew, section);

    await fdOld.close();
    await fdNew.close();

    return;

}

