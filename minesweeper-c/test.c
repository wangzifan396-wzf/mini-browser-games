/* ============================================================================
 *  test.c —— 扫雷游戏：程序入口（菜单 + 一局游戏的流程）
 *  文件编码：UTF-8 with BOM（带签名）
 * ----------------------------------------------------------------------------
 *  为什么要拆成 test.c / game.c / game.h 三个文件？
 *    game.h  只写"有哪些函数、有哪些配置"    —— 相当于说明书
 *    game.c  只写"这些函数具体怎么实现"      —— 相当于零件车间
 *    test.c  只写"游戏怎么跑起来"            —— 相当于总装线
 *  这样改棋盘大小只动 game.h，改算法只动 game.c，互不干扰。
 * ============================================================================ */

#include "game.h"

/* 只在本文件用到的函数，同样加 static */
static void menu(void);
static void game(void);


/* 打印菜单 */
static void menu(void)
{
    printf("\n");
    printf("==========================\n");
    printf("      扫  雷  游  戏      \n");
    printf("==========================\n");
    printf("      1. 开始游戏         \n");
    printf("      0. 退出游戏         \n");
    printf("==========================\n");
}


/* 完整的一局游戏 */
static void game(void)
{
    /* 两个棋盘，都是 11 x 11（ROWS x COLS），但只用中间 9 x 9。
     *
     * 为什么要两个数组？
     *   mine 存"真相"：哪里有雷。玩家永远看不到。
     *   show 存"界面"：玩家已经知道的信息。
     * 如果只用一个数组，你就没地方同时保存"这里有雷"和"这里还没被翻开"。
     *
     * 【原代码问题】这里写的是 char mine[11][11]，把 11 硬编码进去了。
     * 一旦哪天把 ROW 改成 16，ROWS 变成 18，这里还是 11，
     * 类型对不上，轻则警告重则内存越界。用宏就不会有这个问题。 */
    char mine[ROWS][COLS] = { 0 };   /* 雷盘  ：'0' 没雷，'1' 有雷 */
    char show[ROWS][COLS] = { 0 };   /* 展示盘：'*' 未知，数字/空格 已排查 */

    /* 初始化：注意传的是 ROWS/COLS(11)，要把边框那一圈也填上 */
    InitBoard(mine, ROWS, COLS, SAFE);
    InitBoard(show, ROWS, COLS, HIDE);

    /* 埋雷：传的是 ROW/COL(9)，雷只能埋在可玩区域里 */
    SetMine(mine, ROW, COL);

    /* 调试的时候把下面这行的注释去掉，就能开天眼看到雷在哪 */
    /* DisplayBoard(mine, ROW, COL); */

    DisplayBoard(show, ROW, COL);

    /* 进入排雷主循环，一直玩到赢或者踩雷 */
    FindMine(mine, show, ROW, COL);
}


int main(void)
{
    int input = 0;

    /* 【原代码问题】srand 原来写在 game() 里面，
     * 意味着每开一局就重设一次种子。time(NULL) 精度是"秒"，
     * 上一局结束后马上再开一局，如果还在同一秒内，
     * 种子相同 -> rand() 序列相同 -> 雷的位置一模一样。
     * 正确做法：整个程序运行期间，只在 main 开头设置一次。 */
    srand((unsigned int)time(NULL));

    do
    {
        menu();
        printf("请选择:> ");

        /* 【原代码 BUG】原来是 scanf("%d", &input); 不检查返回值。
         * 输入字母时 scanf 返回 0，脏字符留在缓冲区，
         * input 保持上一次的值，do-while 条件恒真 -> 菜单无限刷屏。 */
        if (scanf("%d", &input) != 1)
        {
            int ch = 0;
            while ((ch = getchar()) != '\n' && ch != EOF)
            {
                ;                        /* 清空缓冲区里剩下的脏字符 */
            }
            if (feof(stdin))
            {
                printf("\n输入已结束，程序退出。\n");
                break;
            }
            printf("请输入数字 1 或 0。\n");
            input = -1;                  /* 给个非 0 值，保证 while(input) 继续循环 */
            continue;
        }

        switch (input)
        {
        case 1:
            printf("\n游戏开始！\n");
            game();
            break;
        case 0:
            printf("退出游戏，再见！\n");
            break;
        default:
            printf("没有这个选项，请重新选择。\n");
            break;
        }
    } while (input);                     /* input 为 0 时退出循环 */

    return 0;
}
