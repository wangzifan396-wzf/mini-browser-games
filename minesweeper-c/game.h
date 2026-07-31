#pragma once
/* ============================================================================
 *  game.h —— 扫雷游戏：全局配置 + 对外函数声明
 * ----------------------------------------------------------------------------
 *  【文件编码】UTF-8 with BOM（带签名）
 *  MSVC 靠文件开头的 BOM 来判断源码是不是 UTF-8。
 *  如果存成"UTF-8 无 BOM"，MSVC 会按系统默认的 GBK 去解析，中文立刻变乱码。
 *  在 VS 里另存为时一定要选：Unicode (UTF-8 带签名) - 代码页 65001
 * ============================================================================ */

/* 必须写在 #include <stdio.h> 之前，否则 MSVC 会对 scanf 报 C4996 错误 */
#define _CRT_SECURE_NO_WARNINGS 1

#include <stdio.h>      /* printf / scanf / getchar        */
#include <stdlib.h>     /* rand / srand                    */
#include <time.h>       /* time，用来做随机数种子          */

/* ---------------------------- 棋盘尺寸 ---------------------------- */
#define ROW  9                 /* 玩家看得到的行数            */
#define COL  9                 /* 玩家看得到的列数            */

/* 数组要比可玩区域大一圈，多出来的这一圈叫"护城河"/"哨兵边框"。
 * 有了它，统计 (x,y) 周围 8 个格子时就不用写一堆边界判断，
 * 因为 x-1 / x+1 最远只会摸到边框，不会越界。
 *
 * 【原代码 BUG】写成 #define ROWS ROW+2 没有括号。
 * 这里恰好 char board[ROWS][COLS] 展开成 [9+2][9+2] 没出事，
 * 但只要写出 ROWS*2 就会变成 9+2*2 = 13，而不是期望的 22。
 * 宏定义里的表达式一律用括号包起来，这是硬规矩。 */
#define ROWS (ROW + 2)
#define COLS (COL + 2)

#define EASY_COUNT 10          /* 雷的总数，简单难度 10 颗    */

/* ------------------------ 棋盘里用到的字符 ------------------------ */
/* 用宏起名字，比代码里到处散落 '0' '1' '*' 这种"魔法字符"清楚得多 */
#define MINE  '1'   /* 雷盘：这一格有雷                        */
#define SAFE  '0'   /* 雷盘：这一格没雷                        */
#define HIDE  '*'   /* 展示盘：还没被排查                      */
#define BLANK ' '   /* 展示盘：已排查，周围 0 颗雷             */
#define BOOM  'X'   /* 结算时显示：这里埋着一颗你没排掉的雷    */
#define STEP  '@'   /* 结算时显示：你就是踩在这一格上死的      */

/* -------------------------- 对外的四个函数 ------------------------- */

/* 初始化棋盘：把整个数组（含边框）全部填成同一个字符 set */
void InitBoard(char board[ROWS][COLS], int rows, int cols, char set);

/* 打印棋盘：只打印中间 row x col 的可玩区域，边框不给玩家看 */
void DisplayBoard(char board[ROWS][COLS], int row, int col);

/* 在雷盘上随机埋 EASY_COUNT 颗雷 */
void SetMine(char board[ROWS][COLS], int row, int col);

/* 排雷主循环：读坐标、判输赢、自动展开，一直玩到赢或者踩雷 */
void FindMine(char mine[ROWS][COLS], char show[ROWS][COLS], int row, int col);
