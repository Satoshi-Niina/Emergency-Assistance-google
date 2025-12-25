/**
 * Machines API - 機械管理
 */

import { dbQuery } from '../../infra/db.mjs';

export default async function machinesHandler(req, res) {
  const method = req.method;
  // req.path は /api/machines/machine-types の場合、/api/machines/machine-types となる（app.getで登録しているため）
  // splitして判定する
  const pathParts = req.path.split('/').filter(p => p);
  // pathParts: ['api', 'machines', 'machine-types', ':id?']

  // machine-types 配下かどうかで明示的に判定する（UUIDでも動くようにする）
  const isMachineTypes = pathParts[2] === 'machine-types';
  const subResource = isMachineTypes ? 'machine-types' : null;
  const id = isMachineTypes
    ? (pathParts[3] || null)
    : (pathParts[2] || null);

  console.log('[api/machines] Request:', { method, path: req.path, subResource, id });

  try {
    // GET /api/machines/machine-types - 機械タイプ一覧
    if (method === 'GET' && subResource === 'machine-types' && !id) {
      const result = await dbQuery(`
        SELECT id, machine_type_name, created_at
        FROM machine_types
        ORDER BY machine_type_name ASC
      `);

      return res.json({
        success: true,
        machineTypes: result.rows,
        data: result.rows,
        total: result.rows.length,
        timestamp: new Date().toISOString(),
      });
    }

    // POST /api/machines/machine-types - 機械タイプ新規登録
    if (method === 'POST' && subResource === 'machine-types') {
      const { machine_type_name } = req.body;

      if (!machine_type_name) {
        return res.status(400).json({
          success: false,
          error: '機械タイプ名が必要です',
        });
      }

      const result = await dbQuery(
        `INSERT INTO machine_types (machine_type_name) VALUES ($1) RETURNING *`,
        [machine_type_name]
      );

      return res.json({
        success: true,
        data: result.rows[0],
        message: '機械タイプを登録しました',
      });
    }

    // PUT /api/machines/machine-types/:id - 機械タイプ更新
    if (method === 'PUT' && subResource === 'machine-types' && id) {
      const { machine_type_name } = req.body;

      if (!machine_type_name) {
        return res.status(400).json({
          success: false,
          error: '機械タイプ名が必要です',
        });
      }

      const result = await dbQuery(
        `UPDATE machine_types SET machine_type_name = $1 WHERE id = $2 RETURNING *`,
        [machine_type_name, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '機械タイプが見つかりません',
        });
      }

      return res.json({
        success: true,
        data: result.rows[0],
        message: '機械タイプを更新しました',
      });
    }

    // DELETE /api/machines/machine-types/:id - 機械タイプ削除
    if (method === 'DELETE' && subResource === 'machine-types' && id) {
      const result = await dbQuery(
        `DELETE FROM machine_types WHERE id = $1 RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '機械タイプが見つかりません',
        });
      }

      return res.json({
        success: true,
        message: '機械タイプを削除しました',
      });
    }

    // GET /api/machines - 機械一覧取得
    if (method === 'GET' && (!subResource || !isNaN(subResource))) { // ID指定のGETもここに来る可能性があるので注意
       if (id && subResource === id) {
         // 個別取得ロジックがあればここに
       } else {
        const result = await dbQuery(`
            SELECT m.id, m.machine_number, m.machine_type_id, m.created_at, mt.machine_type_name
            FROM machines m
            LEFT JOIN machine_types mt ON m.machine_type_id = mt.id
            ORDER BY m.machine_number ASC
        `);

        return res.json({
            success: true,
            machines: result.rows,
            data: result.rows,
            total: result.rows.length,
            timestamp: new Date().toISOString(),
        });
       }
    }

    // POST /api/machines - 機械新規登録
    if (method === 'POST' && !subResource) {
      const { machine_number, machine_type_id } = req.body;

      if (!machine_number || !machine_type_id) {
        return res.status(400).json({
          success: false,
          error: '機械番号と機械タイプIDが必要です',
        });
      }

      const result = await dbQuery(
        `INSERT INTO machines (machine_number, machine_type_id) VALUES ($1, $2) RETURNING *`,
        [machine_number, machine_type_id]
      );

      return res.json({
        success: true,
        data: result.rows[0],
        message: '機械を登録しました',
      });
    }

    // PUT /api/machines/:id - 機械情報更新
    if (method === 'PUT' && !subResource && id) {
      const { machine_number, machine_type_id } = req.body;

      const result = await dbQuery(
        `UPDATE machines SET machine_number = $1, machine_type_id = $2 WHERE id = $3 RETURNING *`,
        [machine_number, machine_type_id, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '機械が見つかりません',
        });
      }

      return res.json({
        success: true,
        data: result.rows[0],
        message: '機械情報を更新しました',
      });
    }

    // DELETE /api/machines/:id - 機械削除
    if (method === 'DELETE' && !subResource && id) {
      const result = await dbQuery(
        `DELETE FROM machines WHERE id = $1 RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '機械が見つかりません',
        });
      }

      return res.json({
        success: true,
        message: '機械を削除しました',
      });
    }

    return res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      path: req.path
    });

  } catch (error) {
    console.error('[api/machines] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: error.message
    });
  }
}
