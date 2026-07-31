/* ============================================================================
 *  game.c —— 扫雷游戏：全部功能的实现
 *  文件编码：UTF-8 with BOM（带签名）
 * ============================================================================ */

#include "game.h"

/* ----------------------------------------------------------------------------
 *  下面这几个是"内部辅助函数"，只给 game.c 自己用。
 *  加 static 的意思是：这个名字只在本文件里可见，别的 .c 文件看不到它，
 *  这样就不会和别人写的同名函数撞车。这是 C 语言里做"私有函数"的标准手法。
 * -------------------------------------------------------------------------- */
static int  GetMineCount(char mine[ROWS][COLS], int x, int y);
static int  Expand(char mine[ROWS][COLS], char show[ROWS][COLS], int x, int y);
static int  ReadCoord(int* x, int* y);
static void MoveMineAway(char mine[ROWS][COLS], int row, int col, int x, int y);
static void RevealAll(char mine[ROWS][COLS], char show[ROWS][COLS], int row, int col);


/* ============================ 1. 初始化棋盘 ============================ */
/* 注意循环是 0 .. rows-1，把最外面那圈边框也一起填了。
 * 调用时传的是 ROWS/COLS（11），不是 ROW/COL（9）。 */
void InitBoard(char board[ROWS][COLS], int rows, int cols, char set)
{
    int i = 0;
    for (i = 0; i < rows; i++)
    {
        int j = 0;
        for (j = 0; j < cols; j++)
        {
            board[i][j] = set;
        }
    }
}


/* ============================== 2. 打印棋盘 ============================== */
/* 只打印 1..row / 1..col 这块可玩区域，第 0 行/列和第 10 行/列是边框，不显示。
 *
 * 【原代码问题】列号那一行写的是 for (j = 0; j <= cols; j++)，
 * 打出来是 0 1 2 ... 9，那个"0"其实是在客串左上角的占位符，
 * 属于"歪打正着"，看代码的人根本猜不出意图。这里改成明确的写法。
 *
 * 对齐技巧：行号前缀占 4 格，每个格子占 3 格，列号也占 3 格，
 * 这样列号正好压在对应格子的正上方。 */
void DisplayBoard(char board[ROWS][COLS], int row, int col)
{
    int i = 0;
    int j = 0;

    printf("\n");

    /* 第一行：列号 */
    printf("    ");                       /* 4 个空格，给左边的行号让位 */
    for (j = 1; j <= col; j++)
    {
        printf("%2d ", j);
    }
    printf("\n");

    /* 第二行：一条分隔线 */
    printf("   +");
    for (j = 1; j <= col; j++)
    {
        printf("---");
    }
    printf("\n");

    /* 剩下的行：行号 + 这一行的所有格子 */
    for (i = 1; i <= row; i++)
    {
        printf("%2d |", i);
        for (j = 1; j <= col; j++)
        {
            printf(" %c ", board[i][j]);
        }
        printf("\n");
    }
    printf("\n");
}


/* =============================== 3. 埋雷 =============================== */
/* rand() % row 得到 0 .. row-1，再 +1 就是 1 .. row，正好是可玩区域的下标。
 * 如果随机到的位置已经有雷了，这一轮不算数，重新摇，
 * 直到真的埋满 EASY_COUNT 颗为止。 */
void SetMine(char board[ROWS][COLS], int row, int col)
{
    int count = 0;
    while (count < EASY_COUNT)
    {
        int x = rand() % row + 1;
        int y = rand() % col + 1;
        if (board[x][y] == SAFE)
        {
            board[x][y] = MINE;
            count++;
        }
    }
}


/* ==================== 4. 数一数 (x,y) 周围有几颗雷 ==================== */
/* 遍历以 (x,y) 为中心的 3x3 共 9 个格子，跳过中心自己，数有几个是雷。
 *
 * 这里能大胆写 x-1 / x+1 而不做边界检查，靠的就是那圈边框：
 * 就算 x==1，x-1==0 也是合法下标，那里存的是 '0'，不会被误判成雷。 */
static int GetMineCount(char mine[ROWS][COLS], int x, int y)
{
    int count = 0;
    int i = 0;
    int j = 0;
    for (i = x - 1; i <= x + 1; i++)
    {
        for (j = y - 1; j <= y + 1; j++)
        {
            if (i == x && j == y)
            {
                continue;               /* 跳过中心格自己 */
            }
            if (mine[i][j] == MINE)
            {
                count++;
            }
        }
    }
    return count;
}


/* ======================= 5. 自动展开（递归的核心）======================= */
/* 返回值 = 这次一共翻开了多少个新格子。
 *
 * 三种情况：
 *   A. 这格已经翻开过     -> 直接返回 0，一个都没新翻。这是递归的"刹车"。
 *   B. 周围有雷（count>0）-> 显示数字，返回 1，不再往外扩。
 *   C. 周围没雷（count==0）-> 显示空白，然后对 8 个邻居各调用一次自己。
 *
 * 情况 C 里翻开的邻居一定是安全的：既然 (x,y) 周围 0 颗雷，
 * 那它的 8 个邻居里就不可能藏着雷。所以自动展开永远不会炸。 */
static int Expand(char mine[ROWS][COLS], char show[ROWS][COLS], int x, int y)
{
    int count = 0;
    int revealed = 0;
    int i = 0;
    int j = 0;

    /* A. 已经翻开过就立刻返回，否则两个相邻的空格会互相调用，无限递归爆栈 */
    if (show[x][y] != HIDE)
    {
        return 0;
    }

    count = GetMineCount(mine, x, y);

    /* B. 周围有雷，显示数字就停 */
    if (count > 0)
    {
        show[x][y] = (char)(count + '0');   /* 数字转字符：3 + '0' == '3' */
        return 1;
    }

    /* C. 周围没雷，标成空白，然后向 8 个方向扩散 */
    show[x][y] = BLANK;
    revealed = 1;

    for (i = x - 1; i <= x + 1; i++)
    {
        for (j = y - 1; j <= y + 1; j++)
        {
            /* 这里必须判边界：边框格子不属于可玩区域，不能翻开 */
            if (i >= 1 && i <= ROW && j >= 1 && j <= COL)
            {
                revealed += Expand(mine, show, i, j);
            }
        }
    }
    return revealed;
}


/* ==================== 6. 安全地读入两个整数坐标 ==================== */
/* 返回  1：成功读到两个整数
 * 返回  0：格式不对（比如输入了字母）
 * 返回 -1：输入流结束了（Ctrl+Z 回车 / 管道读完）
 *
 * 【原代码 BUG】直接写 scanf("%d %d", &x, &y); 不看返回值。
 * 一旦用户输入 "abc"，scanf 匹配失败会返回 0，并且把 "abc" 原封不动
 * 留在输入缓冲区里。下一轮 scanf 又读到同样的 "abc"，又失败……
 * 结果就是屏幕疯狂刷屏，程序卡死。
 * 正确做法：检查返回值，失败就用 getchar() 把这一行脏数据全部吃掉。 */
static int ReadCoord(int* x, int* y)
{
    int ret = scanf("%d %d", x, y);
    if (ret == EOF)
    {
        return -1;
    }
    if (ret != 2)
    {
        int ch = 0;
        while ((ch = getchar()) != '\n' && ch != EOF)
        {
            ;                            /* 把这一行剩下的字符全丢掉 */
        }
        return 0;
    }
    return 1;
}


/* ==================== 7. 首击保护：把第一脚踩到的雷挪走 ==================== */
/* 原版扫雷第一下就可能踩雷，这纯属运气不好，体验很差。
 * 处理办法：把 (x,y) 这颗雷取消，随便找一个还没埋雷的空位补上，
 * 雷的总数不变，游戏依然公平。 */
static void MoveMineAway(char mine[ROWS][COLS], int row, int col, int x, int y)
{
    mine[x][y] = SAFE;
    while (1)
    {
        int nx = rand() % row + 1;
        int ny = rand() % col + 1;
        if (mine[nx][ny] == SAFE && !(nx == x && ny == y))
        {
            mine[nx][ny] = MINE;
            break;
        }
    }
}


/* ==================== 8. 结算：把还没翻开的格子全部亮出来 ==================== */
/* 【原代码问题】游戏结束时直接 DisplayBoard(mine, ...)，
 * 满屏都是 '0' 和 '1'，玩家根本看不懂哪里是雷。
 * 改成：在玩家已经看到的 show 盘上，把没翻开的格子补全，
 * 雷显示成 X，安全格显示成数字或空白，一眼就能复盘。 */
static void RevealAll(char mine[ROWS][COLS], char show[ROWS][COLS], int row, int col)
{
    int i = 0;
    int j = 0;
    for (i = 1; i <= row; i++)
    {
        for (j = 1; j <= col; j++)
        {
            if (show[i][j] != HIDE)
            {
                continue;                /* 玩家已经翻开的，保持原样 */
            }
            if (mine[i][j] == MINE)
            {
                show[i][j] = BOOM;
            }
            else
            {
                int c = GetMineCount(mine, i, j);
                show[i][j] = (c == 0) ? BLANK : (char)(c + '0');
            }
        }
    }
}


/* ============================== 9. 排雷主循环 ============================== */
void FindMine(char mine[ROWS][COLS], char show[ROWS][COLS], int row, int col)
{
    int x = 0;
    int y = 0;
    int win = 0;                                  /* 已经安全翻开的格子数 */
    int total = row * col - EASY_COUNT;           /* 需要翻开的总数 81-10 = 71 */
    int first = 1;                                /* 标记是不是第一次点击 */

    while (win < total)
    {
        int ret = 0;

        printf("还剩 %d 格待排查，请输入坐标（行 列，用空格隔开）:> ", total - win);

        ret = ReadCoord(&x, &y);
        if (ret == -1)
        {
            printf("\n输入已结束，本局中止。\n");
            return;
        }
        if (ret == 0)
        {
            printf("输入格式不对，要输入两个数字，比如：3 5\n");
            continue;
        }

        /* 边界检查：坐标必须落在 1..row / 1..col 里 */
        if (x < 1 || x > row || y < 1 || y > col)
        {
            printf("坐标越界了，行和列都要在 1 ~ %d 之间。\n", row);
            continue;
        }

        /* 【原代码 BUG】没有这一段检查。
         * 原来的写法是：只要 count>0 就 show[x][y]=数字; win++;
         * 完全不管这一格是不是已经翻开过。
         * 后果：反复输入同一个坐标 71 次，win 就到 71，直接"胜利"。
         * 修复：已经翻开过的格子直接跳过，不计分。 */
        if (show[x][y] != HIDE)
        {
            printf("(%d, %d) 已经排查过了，换一个位置吧。\n", x, y);
            continue;
        }

        /* 首击保护：第一下如果踩雷，就把这颗雷挪到别处 */
        if (first)
        {
            first = 0;
            if (mine[x][y] == MINE)
            {
                MoveMineAway(mine, row, col, x, y);
            }
        }

        /* 踩雷：游戏结束 */
        if (mine[x][y] == MINE)
        {
            printf("\n很遗憾，(%d, %d) 是一颗雷，你被炸死了！\n", x, y);
            show[x][y] = STEP;                    /* 标出踩爆的那一颗 */
            RevealAll(mine, show, row, col);
            DisplayBoard(show, row, col);
            printf("提示：@ 是你踩爆的雷，X 是剩下没排掉的雷。\n");
            return;
        }

        /* 安全：Expand 会自己判断"显示数字"还是"连锁展开"，
         * 并且把这次新翻开的格子数返回回来。
         * 原代码在这里手写了 if/else 分支，其实 Expand 内部已经做了同样的事，
         * 分支里那句 win++ 正是重复计分 BUG 的源头。 */
        win += Expand(mine, show, x, y);
        DisplayBoard(show, row, col);
    }

    printf("\n恭喜！%d 颗雷全部避开，排雷成功！\n", EASY_COUNT);
    RevealAll(mine, show, row, col);
    DisplayBoard(show, row, col);
    printf("提示：X 是雷的位置。\n");
}
