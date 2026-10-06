import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const MAX_TEXT_LENGTH = 140;

const EARTH_RADIUS_M = 6371000;

/** 2点間の距離 (メートル) */
export function distanceMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export class ValidationError extends Error {}

/**
 * コメントの保存場所。
 * 単一プロセス内で同期的に処理するので、投稿〜消滅判定はアトミックに行われる。
 */
export class CommentStore {
  /**
   * @param {object} opts
   * @param {string|null} opts.file 保存先 JSON ファイル (null ならメモリのみ)
   * @param {number} opts.overlapRadius この距離 (m) 以内のコメントを「重なっている」とみなす
   * @param {number} opts.overlapLimit 重なりがこの数に達したら、まとめて消える
   */
  constructor({ file = null, overlapRadius = 30, overlapLimit = 10 } = {}) {
    this.file = file;
    this.overlapRadius = overlapRadius;
    this.overlapLimit = overlapLimit;
    this.comments = [];
    if (file) this.#load();
  }

  #load() {
    try {
      this.comments = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.comments = [];
    }
  }

  #save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.comments));
    renameSync(tmp, this.file);
  }

  #toPublic(comment, ownerHash) {
    const { ownerHash: owner, ...rest } = comment;
    return { ...rest, mine: ownerHash != null && owner === ownerHash };
  }

  /** 範囲内のコメント一覧 (範囲指定なしなら全件) */
  list(bounds, ownerToken) {
    const ownerHash = ownerToken ? hashToken(ownerToken) : null;
    return this.comments
      .filter((c) => !bounds || inBounds(c, bounds))
      .map((c) => this.#toPublic(c, ownerHash));
  }

  /**
   * コメントを投稿する。
   * 投稿によって周囲のコメントが overlapLimit 個に達したら、それらを全部消す。
   * @returns {{ comment: object, removed: string[] }}
   */
  add({ lat, lng, text }, ownerToken) {
    if (!ownerToken) throw new ValidationError('owner token is required');
    lat = Number(lat);
    lng = Number(lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new ValidationError('invalid lat');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new ValidationError('invalid lng');
    text = typeof text === 'string' ? text.trim() : '';
    if (!text) throw new ValidationError('text is required');
    if ([...text].length > MAX_TEXT_LENGTH) {
      throw new ValidationError(`text must be ${MAX_TEXT_LENGTH} characters or less`);
    }

    const comment = {
      id: randomUUID(),
      lat,
      lng,
      text,
      createdAt: new Date().toISOString(),
      ownerHash: hashToken(ownerToken),
    };

    const overlapping = this.comments.filter(
      (c) => distanceMeters(c, comment) <= this.overlapRadius,
    );

    let removed = [];
    if (overlapping.length + 1 >= this.overlapLimit) {
      removed = [...overlapping.map((c) => c.id), comment.id];
      const removedSet = new Set(removed);
      this.comments = this.comments.filter((c) => !removedSet.has(c.id));
    } else {
      this.comments.push(comment);
    }
    this.#save();

    return { comment: this.#toPublic(comment, comment.ownerHash), removed };
  }

  /**
   * 自分のコメントを消す。
   * @returns {'deleted'|'not_found'|'forbidden'}
   */
  remove(id, ownerToken) {
    const index = this.comments.findIndex((c) => c.id === id);
    if (index === -1) return 'not_found';
    if (!ownerToken || this.comments[index].ownerHash !== hashToken(ownerToken)) {
      return 'forbidden';
    }
    this.comments.splice(index, 1);
    this.#save();
    return 'deleted';
  }
}

function inBounds(c, { south, west, north, east }) {
  if (c.lat < south || c.lat > north) return false;
  // 日付変更線をまたぐ範囲 (west > east) にも対応
  return west <= east ? c.lng >= west && c.lng <= east : c.lng >= west || c.lng <= east;
}
