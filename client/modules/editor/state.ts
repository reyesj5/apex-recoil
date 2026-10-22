/**
* Copyright 2021 Mikhail Goncharov
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

// Editor state shared by the editor modules: canvas points and anchors, the loaded weapons, the
// persisted editor settings, and the session/background state that several modules reassign
// through the setters at the end of this file.
import Konva from 'konva';
import { Weapon } from '../../game';
import { NumericAttribute, StringAttribute, BooleanAttribute } from '../../storage';
import { ActiveSessionData } from '../types';

export let points = new Map<string, Konva.Circle>();
export const anchors = new Set<string>();
export const weapons = new Map<string, Weapon>();
export const NS = 'editor';
export const aDistance = new NumericAttribute('distance', NS, 100);
export const aWeapon = new StringAttribute('weapon', NS, 'r301');
export const aStock = new NumericAttribute('stock', NS, 0);
export const aBarrel = new NumericAttribute('barrel', NS, 0);
export const aPoints = new StringAttribute('points', NS, '[]');
export const aEdges = new StringAttribute('edges', NS, '[]');
export const aImageData = new StringAttribute('imagedata', NS, '[]');
export const aAnchors = new StringAttribute('anchors', NS, '[]');
export const aThreshold = new NumericAttribute('threshold', NS, 0);
export const aSens = new NumericAttribute('sens', NS, 5);
export const aTargetFrom = new NumericAttribute('target-from', NS, 0);
export const aTargetTo = new NumericAttribute('target-to', NS, 0);
export const aEnableThreshold = new BooleanAttribute('enable-threshold', NS, true);
export const aAutoTargets = new BooleanAttribute('auto-targets', NS, true);
const aConnectHover = new BooleanAttribute('connect-hover', NS, true);
export const aComment =  new StringAttribute('comment', NS, '');
export const aHdrMode = new StringAttribute('hdr-mode', NS, 'hdr-standard');

export let activeSessionData: ActiveSessionData | null = null;
export let activeBgImageScale = 1.0;
export let activeBgImageOffset = { x: 0, y: 0 };
export let activeOpticZoom = 2.0;
export let currentBgImageObj: Konva.Image | null = null;
export let correctionExpectedShots = 0;

export let activeBatchIndex: number = 0;

// Shared state that several parts of the editor reassign goes through these setters
export function setActiveSessionData(data: ActiveSessionData | null) { activeSessionData = data; }
export function setActiveBgImageScale(scale: number) { activeBgImageScale = scale; }
export function setActiveBgImageOffset(offset: { x: number; y: number }) { activeBgImageOffset = offset; }
export function setActiveOpticZoom(zoom: number) { activeOpticZoom = zoom; }
export function setCurrentBgImageObj(image: Konva.Image | null) { currentBgImageObj = image; }
export function setCorrectionExpectedShots(shots: number) { correctionExpectedShots = shots; }
export function setActiveBatchIndex(index: number) { activeBatchIndex = index; }
