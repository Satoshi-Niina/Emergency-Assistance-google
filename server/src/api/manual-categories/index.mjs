/**
 * Manual Categories API - マニュアルカテゴリ管理
 * DBから動的にカテゴリを取得・管理
 */

import { dbQuery } from '../../infra/db.mjs';

export default async function manualCategoriesHandler(req, res) {
  const method = req.method;
  const pathParts = req.path.split('/').filter(p => p);
  const id = pathParts[3] || null; // /api/manual-categories/:id

  console.log('[api/manual-categories] Request:', { method, path: req.path, id });

  try {
    // GET /api/manual-categories - カテゴリ一覧取得
    if (method === 'GET' && !id) {
      const result = await dbQuery(`
        WITH RECURSIVE category_tree AS (
          -- ルートカテゴリ
          SELECT 
            id,
            category_code,
            category_name,
            parent_id,
            icon_emoji,
            sort_order,
            is_active,
            0 as level,
            ARRAY[sort_order] as path
          FROM manual_categories
          WHERE parent_id IS NULL AND is_active = true
          
          UNION ALL
          
          -- 子カテゴリ
          SELECT 
            c.id,
            c.category_code,
            c.category_name,
            c.parent_id,
            c.icon_emoji,
            c.sort_order,
            c.is_active,
            ct.level + 1,
            ct.path || c.sort_order
          FROM manual_categories c
          INNER JOIN category_tree ct ON c.parent_id = ct.id
          WHERE c.is_active = true
        )
        SELECT * FROM category_tree
        ORDER BY path
      `);

      // 階層構造に変換
      const categories = result.rows;
      const categoryMap = new Map();
      const rootCategories = [];

      // まず全カテゴリをMapに格納
      categories.forEach(cat => {
        categoryMap.set(cat.id, {
          ...cat,
          children: []
        });
      });

      // 親子関係を構築
      categories.forEach(cat => {
        const category = categoryMap.get(cat.id);
        if (cat.parent_id) {
          const parent = categoryMap.get(cat.parent_id);
          if (parent) {
            parent.children.push(category);
          }
        } else {
          rootCategories.push(category);
        }
      });

      return res.json({
        success: true,
        categories: rootCategories,
        flatList: categories, // フラットリストも返す
        total: categories.length,
        timestamp: new Date().toISOString(),
      });
    }

    // GET /api/manual-categories/flat - フラットなカテゴリ一覧（select要素用）
    if (method === 'GET' && req.path.includes('/flat')) {
      const result = await dbQuery(`
        SELECT 
          id,
          category_code,
          category_name,
          parent_id,
          icon_emoji,
          is_active
        FROM manual_categories
        WHERE is_active = true
        ORDER BY sort_order ASC
      `);

      return res.json({
        success: true,
        categories: result.rows,
        total: result.rows.length,
      });
    }

    // POST /api/manual-categories - カテゴリ新規作成
    if (method === 'POST') {
      const { category_code, category_name, parent_id, icon_emoji, sort_order } = req.body;

      if (!category_code || !category_name) {
        return res.status(400).json({
          success: false,
          error: 'カテゴリコードと名前が必要です',
        });
      }

      const result = await dbQuery(
        `INSERT INTO manual_categories 
          (category_code, category_name, parent_id, icon_emoji, sort_order) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [category_code, category_name, parent_id || null, icon_emoji || '📁', sort_order || 0]
      );

      return res.json({
        success: true,
        data: result.rows[0],
        message: 'カテゴリを作成しました',
      });
    }

    // PUT /api/manual-categories/:id - カテゴリ更新
    if (method === 'PUT' && id) {
      const { category_name, icon_emoji, sort_order, is_active } = req.body;

      const result = await dbQuery(
        `UPDATE manual_categories 
         SET category_name = COALESCE($1, category_name),
             icon_emoji = COALESCE($2, icon_emoji),
             sort_order = COALESCE($3, sort_order),
             is_active = COALESCE($4, is_active),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [category_name, icon_emoji, sort_order, is_active, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'カテゴリが見つかりません',
        });
      }

      return res.json({
        success: true,
        data: result.rows[0],
        message: 'カテゴリを更新しました',
      });
    }

    // DELETE /api/manual-categories/:id - カテゴリ削除（論理削除）
    if (method === 'DELETE' && id) {
      // 子カテゴリがある場合は削除不可
      const childCheck = await dbQuery(
        `SELECT COUNT(*) as count FROM manual_categories WHERE parent_id = $1`,
        [id]
      );

      if (childCheck.rows[0].count > 0) {
        return res.status(400).json({
          success: false,
          error: '子カテゴリが存在するため削除できません',
        });
      }

      // 論理削除
      const result = await dbQuery(
        `UPDATE manual_categories SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'カテゴリが見つかりません',
        });
      }

      return res.json({
        success: true,
        message: 'カテゴリを削除しました',
      });
    }

    // POST /api/manual-categories/sync-machine-types - machine_typesと同期
    if (method === 'POST' && req.path.includes('/sync-machine-types')) {
      // machine_typesから新しい機器タイプを取得してカテゴリに追加
      await dbQuery(`
        INSERT INTO manual_categories (category_code, category_name, parent_id, icon_emoji, sort_order)
        SELECT 
          'equipment/' || LOWER(REPLACE(mt.machine_type_name, ' ', '-')),
          mt.machine_type_name,
          (SELECT id FROM manual_categories WHERE category_code = 'equipment'),
          '🚜',
          100 + ROW_NUMBER() OVER (ORDER BY mt.machine_type_name)
        FROM machine_types mt
        WHERE NOT EXISTS (
          SELECT 1 FROM manual_categories mc 
          WHERE mc.category_code = 'equipment/' || LOWER(REPLACE(mt.machine_type_name, ' ', '-'))
        )
      `);

      return res.json({
        success: true,
        message: '機器タイプと同期しました',
      });
    }

    return res.status(404).json({
      success: false,
      error: 'エンドポイントが見つかりません',
    });

  } catch (error) {
    console.error('[api/manual-categories] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'サーバーエラー',
      message: error.message,
    });
  }
}
